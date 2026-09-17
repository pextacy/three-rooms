/**
 * The dynamic program for THE BROKERS.
 *
 * The state is `(who has been asked, the best price in hand)` — and nothing
 * else. Which prices the brokers you already asked named does not matter once
 * you know the best of them, because every price stays on the table and you will
 * only ever take the best one. That is what **recall** buys, and it is why this
 * state space is tiny: 16 subsets x 11 prices.
 *
 *   A(mask, best) = max( best - fees(mask) ,  max over unasked i of
 *                        E[ A(mask|i, max(best, X_i)) ] - c_i )
 *   RTP           = Σ_house p(price) · A(∅, price)
 *
 * Fees are carried in the MASK, not in the recursion: `fees(mask)` is a pure
 * function of who has been asked, so a leaf subtracts them once and an ask
 * subtracts nothing. Subtracting the fee again when the ask is made — which is
 * how the formula is usually written — double-counts it, and the symptom is a
 * dynamic program that never asks anybody and an RTP exactly equal to taking
 * the house's price.
 *
 * The payout floors at nothing, so a leaf floors too: a player can never lose
 * more than the stake (claude.md §7). With this manifest the floor never binds
 * — the fees total 0.147x and the lowest price in hand is the house's 0.85x —
 * and `test/brokers-rtp.spec.ts` checks that rather than assuming it.
 *
 * Exact BigInt rationals — never floats. `npm run verify:brokers` runs this, and
 * every number printed anywhere is generated from it.
 */
import {
  BROKER_LIST,
  HOUSE,
  WEIGHT_DENOM,
  MAX_PAYOUT_BP,
  PRICE_DENOM,
  feesForMask,
  allPrices,
  type Broker,
} from './market';
import { priceValue, reservationPrice, meanPrice, pandoraChoice, indices } from './weitzman';
import { rat, add, mul, compare, max as maxOf, ZERO, type Rational } from '../../../shared/math/rational';

/** Every mask of brokers who have been asked. */
export const MASKS = 1 << BROKER_LIST.length;

const PRICES = allPrices();
const priceIndex = new Map(PRICES.map((price, i) => [price, i]));

const at = (price: number): number => {
  const index = priceIndex.get(price);
  if (index === undefined) throw new RangeError(`${price} is not a price this market names`);
  return index;
};

export type Solution = {
  /** `value[mask][priceIndex]` — the round's worth from here, BEFORE fees paid. */
  readonly value: readonly (readonly Rational[])[];
  /** True where the DP asks somebody rather than taking what is in hand. */
  readonly asks: readonly (readonly (Broker | null)[])[];
  readonly rtp: Rational;
};

/** What taking the price in hand is worth, net of what the day has cost. */
export function takeValue(mask: number, bestBp: number): Rational {
  const net = bestBp - feesForMask(mask);
  return net <= 0 ? ZERO : rat(net, PRICE_DENOM);
}

/**
 * What asking this broker is worth, given the state. Exact.
 *
 * His fee is NOT subtracted here: it is already inside every child value,
 * because the child's mask includes him and `takeValue` charges the whole mask.
 */
export function askValue(
  solution: Pick<Solution, 'value'>,
  mask: number,
  bestBp: number,
  broker: Broker,
): Rational {
  let total = ZERO;
  for (const quote of broker.quotes) {
    const after = quote.priceBp > bestBp ? quote.priceBp : bestBp;
    const row = solution.value[mask | (1 << broker.id)];
    const value = row?.[at(after)];
    if (value === undefined) throw new Error(`missing A(${mask | (1 << broker.id)}, ${after})`);
    total = add(total, mul(rat(quote.weight, WEIGHT_DENOM), value));
  }
  return total;
}

export function solve(): Solution {
  const value: Rational[][] = [];
  const asks: (Broker | null)[][] = [];
  for (let mask = 0; mask < MASKS; mask++) {
    value[mask] = new Array<Rational>(PRICES.length).fill(ZERO);
    asks[mask] = new Array<Broker | null>(PRICES.length).fill(null);
  }

  // Masks in decreasing popcount: a state only depends on states with strictly
  // more brokers asked, so this is a topological order.
  const order = Array.from({ length: MASKS }, (_, mask) => mask).sort(
    (a, b) => popcount(b) - popcount(a),
  );

  for (const mask of order) {
    for (const [index, price] of PRICES.entries()) {
      let best = takeValue(mask, price);
      let choice: Broker | null = null;

      for (const broker of BROKER_LIST) {
        if (mask & (1 << broker.id)) continue;
        const ask = askValue({ value }, mask, price, broker);
        if (compare(ask, best) > 0) {
          best = ask;
          choice = broker;
        }
      }

      value[mask]![index] = best;
      asks[mask]![index] = choice;
    }
  }

  // The house looks first, for nothing, so a round opens on his price.
  const rtp = HOUSE.reduce<Rational>(
    (sum, quote) => add(sum, mul(rat(quote.weight, WEIGHT_DENOM), value[0]![at(quote.priceBp)] as Rational)),
    ZERO,
  );

  return { value, asks, rtp };
}

/** What the DP does at one state. Null means "take what you are holding". */
export function optimalChoice(solution: Solution, mask: number, bestBp: number): Broker | null {
  return solution.asks[mask]?.[at(bestBp)] ?? null;
}

// ---------------------------------------------------------------------------
//  Policies — the strategy band
// ---------------------------------------------------------------------------

/** A policy: which broker to ask at this state, or null to take what is held. */
export type Policy = (mask: number, bestBp: number) => Broker | null;

export function optimalPolicy(solution: Solution = solve()): Policy {
  return (mask, bestBp) => optimalChoice(solution, mask, bestBp);
}

/**
 * Pandora's rule, from the index alone — no dynamic program in sight.
 *
 * This is the whole point of the game: it must come out EQUAL to the DP, and a
 * test checks that at every reachable state.
 */
export function pandoraPolicy(): Policy {
  return (mask, bestBp) => pandoraChoice(mask, priceValue(bestBp));
}

/** "Take what the house names." The player who does not shop at all. */
export function takeTheHouse(): Policy {
  return () => null;
}

/** "Ask everybody, then take the best." The player who cannot leave it alone. */
export function askEverybody(): Policy {
  return mask => BROKER_LIST.find(broker => (mask & (1 << broker.id)) === 0) ?? null;
}

/** "Ask the `n` best by index, then stop." A rule you can hold in your head. */
export function askFixed(n: number): Policy {
  const order = [...BROKER_LIST].sort((a, b) => compare(reservationPrice(b), reservationPrice(a)));
  return mask => {
    const asked = order.filter(broker => mask & (1 << broker.id)).length;
    return asked >= n ? null : (order[asked] ?? null);
  };
}

/**
 * "Shop in order of average price" — the rule a player invents on round three,
 * and the one the index exists to correct.
 *
 * It keeps Pandora's STOPPING rule and breaks only its ORDER, which is what
 * isolates the mistake: every other way of getting this wrong also changes how
 * long you shop, and then the band cannot say what the ordering alone costs.
 *
 * An earlier version of this policy stopped on the average instead — "ask the
 * best average while it beats what you hold" — and on this market that asks
 * NOBODY: the house's man averages 0.9350x and the best broker averages
 * 0.7490x, so his price already beats every average on the floor. The row sat
 * in the published band labelled "the natural mistake" and returned, to the
 * digit, what never shopping at all returns. A band row that duplicates another
 * row teaches nothing, and calling it a mistake when it makes none is worse
 * than not printing it.
 */
export function askByMeanOrder(): Policy {
  const byMean = [...BROKER_LIST].sort((a, b) => compare(meanPrice(b), meanPrice(a)));
  const z = indices();
  return (mask, bestBp) => {
    const next = byMean.find(broker => (mask & (1 << broker.id)) === 0);
    if (next === undefined) return null;
    // Pandora's own stopping rule: hold once what you have beats the best index
    // still unasked. Only the order the brokers are reached in is wrong.
    let top: Rational | null = null;
    for (const broker of BROKER_LIST) {
      if (mask & (1 << broker.id)) continue;
      const index = z[broker.id] as Rational;
      if (top === null || compare(index, top) > 0) top = index;
    }
    if (top === null) return null;
    return compare(priceValue(bestBp), top) >= 0 ? null : next;
  };
}

/** Expected return of a policy, over the whole market. Exact. */
export function evaluate(policy: Policy): Rational {
  const memo = new Map<string, Rational>();

  const walk = (mask: number, bestBp: number): Rational => {
    const key = `${mask}:${bestBp}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    const choice = policy(mask, bestBp);
    let out: Rational;
    if (choice === null || mask & (1 << choice.id)) {
      out = takeValue(mask, bestBp);
    } else {
      out = choice.quotes.reduce<Rational>(
        (sum, quote) =>
          add(sum, mul(rat(quote.weight, WEIGHT_DENOM), walk(mask | (1 << choice.id), quote.priceBp > bestBp ? quote.priceBp : bestBp))),
        ZERO,
      );
    }
    memo.set(key, out);
    return out;
  };

  return HOUSE.reduce<Rational>(
    (sum, quote) => add(sum, mul(rat(quote.weight, WEIGHT_DENOM), walk(0, quote.priceBp))),
    ZERO,
  );
}

export type NamedPolicy = { readonly label: string; readonly policy: Policy; readonly note?: string };

export function strategyBand(solution: Solution = solve()): readonly NamedPolicy[] {
  return [
    { label: 'Optimal', policy: optimalPolicy(solution), note: 'the declared RTP' },
    { label: "Pandora's rule — the index, no DP", policy: pandoraPolicy(), note: 'provably the same thing' },
    { label: 'Ask the three best by index', policy: askFixed(3) },
    { label: 'Ask the two best by index', policy: askFixed(2) },
    { label: 'Ask one, by index', policy: askFixed(1), note: 'the printed rule' },
    { label: 'Shop in order of average price', policy: askByMeanOrder(), note: 'the natural mistake — the right stopping rule, the wrong order' },
    { label: 'Ask everybody, then take the best', policy: askEverybody(), note: 'the restless player' },
    { label: 'Take what the house names', policy: takeTheHouse(), note: 'the impatient player' },
  ];
}

// ---------------------------------------------------------------------------
//  The shape of a round
// ---------------------------------------------------------------------------

export type RoundShape = {
  /** How often a round ends with exactly `k` brokers asked. */
  readonly asked: readonly Rational[];
  readonly meanAsked: Rational;
  /** How often the player ends up holding the house's own price. */
  readonly keptTheHouse: Rational;
};

export function roundShape(policy: Policy): RoundShape {
  const asked: Rational[] = new Array<Rational>(BROKER_LIST.length + 1).fill(ZERO);
  let keptTheHouse = ZERO;

  const walk = (mask: number, bestBp: number, housePrice: number, weight: Rational): void => {
    const choice = policy(mask, bestBp);
    if (choice === null || mask & (1 << choice.id)) {
      const count = popcount(mask);
      asked[count] = add(asked[count] ?? ZERO, weight);
      if (bestBp === housePrice) keptTheHouse = add(keptTheHouse, weight);
      return;
    }
    for (const quote of choice.quotes) {
      walk(
        mask | (1 << choice.id),
        quote.priceBp > bestBp ? quote.priceBp : bestBp,
        housePrice,
        mul(weight, rat(quote.weight, WEIGHT_DENOM)),
      );
    }
  };

  for (const quote of HOUSE) walk(0, quote.priceBp, quote.priceBp, rat(quote.weight, WEIGHT_DENOM));

  const meanAsked = asked.reduce<Rational>((sum, p, k) => add(sum, mul(p, rat(k))), ZERO);
  return { asked, meanAsked, keptTheHouse };
}

/** P(the round pays at least `multiple` times the stake) under a policy. */
export function probabilityAtLeast(policy: Policy, multiple: Rational): Rational {
  let total = ZERO;

  const walk = (mask: number, bestBp: number, weight: Rational): void => {
    const choice = policy(mask, bestBp);
    if (choice === null || mask & (1 << choice.id)) {
      if (compare(takeValue(mask, bestBp), multiple) >= 0) total = add(total, weight);
      return;
    }
    for (const quote of choice.quotes) {
      walk(mask | (1 << choice.id), quote.priceBp > bestBp ? quote.priceBp : bestBp, mul(weight, rat(quote.weight, WEIGHT_DENOM)));
    }
  };

  for (const quote of HOUSE) walk(0, quote.priceBp, rat(quote.weight, WEIGHT_DENOM));
  return total;
}

/** The best the game can pay, recomputed from the DP rather than asserted. */
export function maximumPayout(): Rational {
  let best = ZERO;
  for (let mask = 0; mask < MASKS; mask++) {
    for (const price of PRICES) {
      // A price is only reachable with a mask that includes whoever names it.
      if (!reachable(mask, price)) continue;
      best = maxOf(best, takeValue(mask, price));
    }
  }
  return best;
}

/** Could this price be in hand with exactly these brokers asked? */
function reachable(mask: number, price: number): boolean {
  if (HOUSE.some(quote => quote.priceBp === price)) return true;
  return BROKER_LIST.some(broker => (mask & (1 << broker.id)) !== 0 && broker.quotes.some(q => q.priceBp === price));
}

function popcount(mask: number): number {
  let count = 0;
  for (let bit = mask; bit; bit >>= 1) count += bit & 1;
  return count;
}

export { PRICES, at as priceSlot, indices, reservationPrice, MAX_PAYOUT_BP };
