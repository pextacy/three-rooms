/**
 * THE BROKERS — the single source of truth (game 3).
 *
 * You hold a claim on a wrecked ship's cargo. At Lloyd's, the house's own man
 * will put a price on it for nothing — and he is not generous. Four brokers will
 * each name a price of their own, and each charges a fee whether you take his
 * price or not. **Every price you have been named stays on the table.** You may
 * take any of them, at any moment, and when you have asked everybody you must
 * take the best of them.
 *
 * The primitive is **Pandora's Box** — Weitzman's (1979) optimal search with
 * recall and per-source costs. It is one of the foundational results of search
 * theory, it is solved by a beautiful index rule, and it has never been turned
 * into a wager.
 *
 * It is not CANDLE: there a refused lot is gone forever and the prize decays
 * with time, so you hold out. Here nothing decays and nothing is ever lost —
 * **recall** is the whole difference, and it inverts the strategy: you stop the
 * moment what you are holding is good enough.
 *
 * It is not THE SURVEY either: there you buy evidence about a hidden state.
 * Nothing is hidden here. You are buying **options**.
 *
 * Pure. No React, no DOM, no `window`, no `Date.now()`, no ambient randomness.
 */

/** Weights are out of this. Asserted at module load and in CI. */
export const WEIGHT_DENOM = 10_000;

/**
 * Prices and fees are in basis points of the stake: 10,000 = 1.00x.
 *
 * Finer than CANDLE's and THE SURVEY's hundredths on purpose — a broker's fee is
 * under a point of the stake in one case, and a game whose costs round to zero
 * is not charging them.
 */
export const PRICE_DENOM = 10_000;

/** How many brokers will look at the claim, beyond the house's own man. */
export const BROKERS = 4;

export type BrokerId = 0 | 1 | 2 | 3;

/** One price a broker might name, and how often he names it. */
export type Quote = {
  readonly priceBp: number;
  readonly weight: number;
};

export type Broker = {
  readonly id: BrokerId;
  readonly name: string;
  /** What he charges to look, whether or not you take his price. */
  readonly feeBp: number;
  /** What he might name. Weights sum to WEIGHT_DENOM. */
  readonly quotes: readonly Quote[];
  /** One line in his own character, for the table. */
  readonly note: string;
};

/**
 * THE HOUSE'S MAN. He looks for nothing and he always looks first, so every
 * round opens with a price already on the table — and the whole game is whether
 * it is good enough to keep.
 *
 * He is deliberately mean and deliberately narrow: two prices, a lowball and a
 * fair one. A player learns in three rounds which of the two he is holding.
 */
export const HOUSE: readonly Quote[] = [
  { priceBp: 8_500, weight: 5_000 },
  { priceBp: 10_200, weight: 5_000 },
] as const;

/**
 * THE BROKERS. Change a number here, run `npm run gen:brokers`, and let the
 * tests say what broke. Never hand-edit the Solidity mirror.
 *
 * The shape of the table is the game: the broker with the BEST average price
 * charges the most and is the last one worth asking, and the broker with the
 * worst average is asked second. That is not a trick — it is what Weitzman's
 * index says, and `core/weitzman.ts` computes it rather than asserting it.
 */
export const BROKER_LIST: readonly Broker[] = [
  {
    id: 0,
    name: 'Stubbs',
    feeBp: 600,
    quotes: [
      { priceBp: 5_500, weight: 6_000 },
      { priceBp: 9_500, weight: 2_700 },
      { priceBp: 12_500, weight: 1_300 },
    ],
    note: 'The best average price on the floor, and the dearest look.',
  },
  {
    id: 1,
    name: 'Marchmont',
    feeBp: 450,
    quotes: [
      { priceBp: 3_500, weight: 6_000 },
      { priceBp: 9_000, weight: 2_500 },
      { priceBp: 12_500, weight: 1_500 },
    ],
    note: 'Much the same reach as Stubbs, for three quarters of the fee.',
  },
  {
    id: 2,
    name: 'Delane',
    feeBp: 325,
    quotes: [
      { priceBp: 4_000, weight: 8_000 },
      { priceBp: 6_000, weight: 1_650 },
      { priceBp: 23_000, weight: 350 },
    ],
    note: 'Names a poor price five times in six, and a very good one otherwise.',
  },
  {
    id: 3,
    name: 'Vanderdek',
    feeBp: 95,
    quotes: [
      { priceBp: 3_500, weight: 9_000 },
      { priceBp: 5_000, weight: 975 },
      { priceBp: 50_000, weight: 25 },
    ],
    note: 'The worst average price of the four, and the cheapest look. One claim in four hundred he values at five times the stake.',
  },
] as const;

/** The largest price anyone on this floor will name. */
export const MAX_PRICE_BP = BROKER_LIST.reduce(
  (max, broker) => broker.quotes.reduce((inner, quote) => (quote.priceBp > inner ? quote.priceBp : inner), max),
  HOUSE.reduce((max, quote) => (quote.priceBp > max ? quote.priceBp : max), 0),
);

/** Every fee, if you asked everybody. */
export const TOTAL_FEES_BP = BROKER_LIST.reduce((sum, broker) => sum + broker.feeBp, 0);

/**
 * The most this game can pay, exactly.
 *
 * Not `MAX_PRICE_BP`: the best price on the floor is Vanderdek's, and the only
 * way to be holding it is to have paid Vanderdek's fee. So the true ceiling is
 * his price less his fee, and `quoteCaps` reserves exactly that — no slack, and
 * no pretending the unreachable corner is reachable (claude.md I5).
 */
export const MAX_PAYOUT_BP = (() => {
  let best = 0;
  for (const broker of BROKER_LIST) {
    for (const quote of broker.quotes) {
      const net = quote.priceBp - broker.feeBp;
      if (net > best) best = net;
    }
  }
  for (const quote of HOUSE) {
    if (quote.priceBp > best) best = quote.priceBp; // the house charges nothing
  }
  return best;
})();

export type Action = 'ASK' | 'TAKE';

/**
 * Payout in the token's base units.
 *
 * THE one payout rule: what you are holding, less what the day has cost you.
 * Every quote the contract makes routes through its twin, so a maximum win
 * cannot disagree with the reserve by a single base unit.
 */
export function payoutBase(stakeBase: bigint, bestBp: number, feesBp: number): bigint {
  if (stakeBase < 0n) throw new RangeError('stake must not be negative');
  if (bestBp < 0 || feesBp < 0) throw new RangeError('prices and fees are never negative');
  // Fees can exceed the price in hand; the payout floors at nothing, and a
  // player can never lose more than the stake (claude.md §7).
  const net = bestBp - feesBp;
  if (net <= 0) return 0n;
  return (stakeBase * BigInt(net)) / BigInt(PRICE_DENOM);
}

export function brokerById(id: BrokerId): Broker {
  const broker = BROKER_LIST[id];
  if (broker === undefined) throw new RangeError(`no broker with id ${id}`);
  return broker;
}

/** The fees owed by a set of brokers, as a bitmask of who has been asked. */
export function feesForMask(mask: number): number {
  let total = 0;
  for (const broker of BROKER_LIST) {
    if (mask & (1 << broker.id)) total += broker.feeBp;
  }
  return total;
}

/** Cumulative weights, for the draw. One table per broker, plus the house. */
export function cumulative(quotes: readonly Quote[]): readonly number[] {
  const out: number[] = [];
  let running = 0;
  for (const quote of quotes) {
    running += quote.weight;
    out.push(running);
  }
  return out;
}

/** Maps a uniform draw in [0, WEIGHT_DENOM) to a price. Mirrors the contract. */
export function priceForDraw(quotes: readonly Quote[], r: number): number {
  if (!Number.isInteger(r) || r < 0 || r >= WEIGHT_DENOM) {
    throw new RangeError(`draw out of range: ${r} (expected an integer in [0, ${WEIGHT_DENOM}))`);
  }
  const bounds = cumulative(quotes);
  for (let i = 0; i < quotes.length; i++) {
    const bound = bounds[i];
    const quote = quotes[i];
    if (bound === undefined || quote === undefined) break;
    if (r < bound) return quote.priceBp;
  }
  throw new Error(`no price for draw ${r} — the weights do not sum to ${WEIGHT_DENOM}`);
}

/** Every price this market can produce, in ascending order. */
export function allPrices(): readonly number[] {
  const set = new Set<number>(HOUSE.map(q => q.priceBp));
  for (const broker of BROKER_LIST) for (const quote of broker.quotes) set.add(quote.priceBp);
  return [...set].sort((a, b) => a - b);
}

// --- asserted at module load, so a bad manifest cannot reach a player --------

for (const quotes of [HOUSE, ...BROKER_LIST.map(b => b.quotes)]) {
  const sum = quotes.reduce((total, quote) => total + quote.weight, 0);
  if (sum !== WEIGHT_DENOM) {
    throw new Error(`a quote table sums to ${sum}, expected ${WEIGHT_DENOM}`);
  }
}
if (BROKER_LIST.length !== BROKERS) {
  throw new Error(`${BROKER_LIST.length} brokers, expected ${BROKERS}`);
}
if (BROKER_LIST.some((broker, i) => broker.id !== i)) {
  throw new Error('broker ids must be their index: the contract indexes them by it');
}
if (MAX_PRICE_BP > 65_535) {
  throw new Error('a price must fit in the uint16 the contract carries it in');
}
