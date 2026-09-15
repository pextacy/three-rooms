/**
 * THE BROKERS, standing alone (docs.md §4.2).
 *
 * Implements the identical `BrokersHost` interface with a seeded PRNG, so the UI
 * has exactly one code path and free play cannot drift into being a different
 * game. Every draw goes through `core/draw.ts` — the same rejection sampler and
 * the same tables the contract uses — and every transition through
 * `core/round.ts`, the state machine the parity tests drive against the deployed
 * Solidity.
 *
 * The word for a broker's price is generated when he is ASKED and not before,
 * which is the demo's mirror of invariant I4: what a broker will say does not
 * exist while the player is deciding whether to pay his fee.
 *
 * **No browser storage.** The purse lives for exactly one page load and `REFILL`
 * is right there (claude.md §7).
 */
import { type BrokerId } from '../../core/market';
import { askingOrder } from '../../core/weitzman';
import { drawHousePrice, drawQuote } from '../../core/draw';
import { openRound, transition, takePayout, hasAsked, unasked, type RoundState } from '../../core/round';
import { dwellWithTurbo } from '../audio/voice';
import { createPrng, seedFromCrypto, type Prng } from '../../../../shared/bridge/prng';
import { createViewStore } from '../../../../shared/bridge/host';
import type { BrokersAction, BrokersHost, BrokersSessionView, BrokersView, NamedPrice } from './types';

/** 18 decimals, like the production token, so the arithmetic matches exactly. */
const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

export const DEMO_OPENING_PURSE = 2_000n * ONE;
export const DEMO_DEFAULT_STAKE = 20n * ONE;
export const DEMO_MIN_STAKE = 1n * ONE;

export type DemoBrokersOptions = {
  /** Fixed seed for tests. Omitted in the browser, where it comes from crypto. */
  readonly seed?: readonly [number, number, number, number];
  /** Set to 0 in tests to settle synchronously. */
  readonly randomnessDelayMs?: number;
  readonly turbo?: boolean;
};

export function createDemoBrokersHost(options: DemoBrokersOptions = {}): BrokersHost {
  const prng: Prng = createPrng(options.seed ?? seedFromCrypto());
  const fixedDelay = options.randomnessDelayMs;
  let turbo = options.turbo ?? false;

  let purse = DEMO_OPENING_PURSE;
  let round: RoundState | null = null;
  let session: BrokersSessionView | null = null;
  let sessionCounter = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const store = createViewStore<BrokersView>(() => ({
    kind: 'demo',
    connected: true,
    canBet: !destroyed,
    walletStatus: 'ready',
    tokenSymbol: 'CHIPS',
    tokenDecimals: DECIMALS,
    purseBase: purse,
    minStakeBase: DEMO_MIN_STAKE,
    maxStakeBase: purse > DEMO_MIN_STAKE ? purse : DEMO_MIN_STAKE,
    defaultStakeBase: DEMO_DEFAULT_STAKE,
    theme: 'dark',
    session,
    fatal: null,
  }));

  const patch = (next: Partial<BrokersSessionView>) => {
    if (!session) return;
    session = { ...session, ...next };
    store.emit();
  };

  /** One fresh word per price named, exactly as one VRF word arrives per step. */
  const word = () => prng.nextWord();
  const rehash = () => prng.nextWord();

  /**
   * The Ghost Price: what one of the men you did not ask would have said.
   *
   * Drawn from his own table, and only once the claim is sold, so it cannot have
   * leaked into the decision and it settles nothing. The man chosen is the one
   * the DP would have asked next, because that is the one a player is actually
   * wondering about. Null when everybody was asked.
   */
  const drawGhost = (state: RoundState): NamedPrice | null => {
    const left = unasked(state);
    if (left.length === 0) return null;
    // The next by index — `unasked` preserves the manifest order, so pick the
    // one with the highest reservation price among them.
    const next = [...left].sort((a, b) => indexOf(b) - indexOf(a))[0] as BrokerId;
    return { brokerId: next, priceBp: drawQuote(next, word(), 0, rehash).priceBp };
  };

  const after = (wait: number, step: () => void) => {
    if (pending !== null) clearTimeout(pending);
    if (destroyed) return;
    const ms = fixedDelay ?? wait;
    if (ms <= 0) {
      step();
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      step();
    }, ms);
  };

  /** The house's man looks first, for nothing. */
  const openTheClaim = () => {
    if (destroyed || !round || !session) return;
    const priceBp = drawHousePrice(word(), 0, rehash).priceBp;
    const next = transition(round, { type: 'OPEN', priceBp });
    after(dwellWithTurbo(0, priceBp, turbo), () => {
      if (destroyed || !session) return;
      round = next;
      patch({
        phase: 'waiting-player',
        named: next.named.map(n => ({ brokerId: n.brokerId, priceBp: n.priceBp })),
        bestBp: next.bestBp,
        waitingOn: null,
      });
    });
  };

  /** A broker looks at the claim. His fee is owed the moment he is asked. */
  const sendTo = (brokerId: BrokerId) => {
    if (destroyed || !round || !session) return;
    const asked = transition(round, { type: 'ASK', brokerId });
    // The word is generated HERE, after the fee is already owed — the demo's
    // mirror of invariant I4.
    const priceBp = drawQuote(brokerId, word(), 0, rehash).priceBp;
    const wait = dwellWithTurbo(asked.askedMask, asked.bestBp, turbo);

    round = asked;
    patch({
      phase: 'waiting-randomness',
      askedMask: asked.askedMask,
      waitingOn: brokerId,
    });

    after(wait, () => {
      if (destroyed || !session || !round) return;
      const next = transition(round, { type: 'QUOTE', priceBp });
      round = next;
      patch({
        phase: 'waiting-player',
        named: next.named.map(n => ({ brokerId: n.brokerId, priceBp: n.priceBp })),
        bestBp: next.bestBp,
        waitingOn: null,
      });
    });
  };

  return {
    kind: 'demo',

    subscribe: store.subscribe,
    snapshot: store.view,

    async openSession(stakeBase) {
      if (destroyed) throw new Error('demo host destroyed');
      if (stakeBase < DEMO_MIN_STAKE) throw new Error('stake below the minimum');
      if (stakeBase > purse) throw new Error('stake exceeds the purse');
      if (session && !session.isSettled) throw new Error('a claim is already on the floor');

      purse -= stakeBase; // escrowed, exactly as the facet pulls the wager
      sessionCounter += 1;
      round = openRound(stakeBase);
      session = {
        sessionKey: `demo-${sessionCounter}`,
        sessionId: String(sessionCounter),
        phase: 'waiting-randomness',
        named: [],
        bestBp: 0,
        askedMask: 0,
        waitingOn: null,
        ghost: null,
        stakeBase,
        payoutBase: 0n,
        isSettled: false,
        error: null,
      };
      store.emit();
      openTheClaim();
    },

    async submitAction(action: BrokersAction) {
      if (destroyed) throw new Error('demo host destroyed');
      if (!round || !session || session.phase !== 'waiting-player') {
        throw new Error('there is no claim to shop');
      }

      if (action.kind === 'ASK') {
        if (hasAsked(round, action.brokerId)) throw new Error('he has already named his price');
        sendTo(action.brokerId);
        return;
      }

      const settled = transition(round, { type: 'TAKE' });
      const ghost = drawGhost(settled);
      round = settled;
      purse += settled.payoutBase;
      patch({
        phase: 'settled',
        payoutBase: settled.payoutBase,
        isSettled: true,
        ghost,
      });
    },

    async revealOutcome() {
      // The demo draws its own balance, so there is nothing for the host to unhide.
    },

    dealAgain() {
      if (session?.isSettled) {
        session = null;
        round = null;
        store.emit();
      }
    },

    setTurbo(value: boolean) {
      turbo = value;
    },

    refill() {
      if (destroyed) return;
      if (session && !session.isSettled) return;
      purse = DEMO_OPENING_PURSE;
      store.emit();
    },

    destroy() {
      destroyed = true;
      if (pending !== null) clearTimeout(pending);
      pending = null;
      store.clear();
    },
  };
}

/**
 * Where a broker stands in the asking order — highest index first.
 *
 * Built once from `weitzman.ts`, which is the only place that knows what the
 * order is. The ghost uses it to pick the man a player is actually wondering
 * about: the next one the rule would have sent for.
 */
const RANK = new Map<BrokerId, number>(
  askingOrder().map((broker, position) => [broker.id, askingOrder().length - position]),
);

function indexOf(id: BrokerId): number {
  return RANK.get(id) ?? -1;
}

export { takePayout };
