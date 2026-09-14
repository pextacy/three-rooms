/**
 * The standalone free-play host (docs.md §4.2).
 *
 * Implements the identical `CandleHost` interface with a seeded PRNG, so the UI
 * has exactly one code path and the demo cannot drift into being a different
 * game. Draws go through the same `src/game/rng.ts` as production, and payouts
 * through the same `payoutBase`, so both the distribution and the arithmetic are
 * the production ones.
 *
 * **No browser storage.** `localStorage` and `sessionStorage` are forbidden
 * (claude.md §7): a purse that looks like it survives a reload and does not is a
 * worse lie than one that obviously resets. The purse lives for exactly one page
 * load and `REFILL` is right there.
 */
import { drawLot } from '../game/rng';
import { lotById, lotForDraw } from '../game/paytable';
import { INCHES, payoutBase } from '../game/wax';
import { createPrng, seedFromCrypto, type Prng } from './prng';
import type { CandleHost, HostView, PlayerAction, SessionView } from './types';

/** 18 decimals, like the production token, so the arithmetic matches exactly. */
const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

export const DEMO_OPENING_PURSE = 2_000n * ONE;
export const DEMO_DEFAULT_STAKE = 20n * ONE;
export const DEMO_MIN_STAKE = 1n * ONE;

/** How long a word takes to "arrive". Real enough to feel like a network. */
const DEMO_RANDOMNESS_MS = 260;

export type DemoHostOptions = {
  /** Fixed seed for tests. Omitted in the browser, where it comes from crypto. */
  readonly seed?: readonly [number, number, number, number];
  /** Set to 0 in tests to settle synchronously. */
  readonly randomnessDelayMs?: number;
};

export function createDemoHost(options: DemoHostOptions = {}): CandleHost {
  const prng: Prng = createPrng(options.seed ?? seedFromCrypto());
  const delay = options.randomnessDelayMs ?? DEMO_RANDOMNESS_MS;

  let purse = DEMO_OPENING_PURSE;
  let session: SessionView | null = null;
  let sessionCounter = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  const listeners = new Set<(view: HostView) => void>();

  /**
   * The view object is cached and only rebuilt when something changes, so
   * `snapshot()` returns a STABLE reference. `useSyncExternalStore` re-renders
   * forever if the snapshot is a fresh object every call.
   */
  let cached: HostView | null = null;

  const build = (): HostView => ({
    kind: 'demo',
    connected: true,
    canBet: !destroyed,
    walletStatus: 'ready',
    tokenSymbol: 'CHIPS',
    tokenDecimals: DECIMALS,
    purseBase: purse,
    minStakeBase: DEMO_MIN_STAKE,
    // Free play has no vault to protect, so the only ceiling is the purse.
    maxStakeBase: purse > DEMO_MIN_STAKE ? purse : DEMO_MIN_STAKE,
    defaultStakeBase: DEMO_DEFAULT_STAKE,
    theme: 'dark',
    session,
    fatal: null,
  });

  const view = (): HostView => (cached ??= build());

  const emit = () => {
    cached = null;
    const next = view();
    for (const listener of listeners) listener(next);
  };

  const patch = (next: Partial<SessionView>) => {
    if (!session) return;
    session = { ...session, ...next };
    emit();
  };

  /** Draw the lot for the current inch, exactly as `onRandomness` would. */
  const revealLot = () => {
    if (destroyed || !session) return;
    // The word is generated HERE, after the previous decision is already
    // locked — the demo's mirror of invariant I4.
    const { value } = drawLot(prng.nextWord(), 0, () => prng.nextWord());
    const lot = lotForDraw(value);
    const inch = session.inch;

    if (inch >= INCHES) {
      // The candle gutters: whatever is on the table is claimed.
      const payout = payoutBase(session.stakeBase, lot.faceBp, inch);
      purse += payout;
      patch({ lotId: lot.id, phase: 'settled', payoutBase: payout, isSettled: true });
      return;
    }
    patch({ lotId: lot.id, phase: 'waiting-player' });
  };

  const scheduleReveal = () => {
    if (pending !== null) clearTimeout(pending);
    if (delay <= 0) {
      revealLot();
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      revealLot();
    }, delay);
  };

  return {
    kind: 'demo',

    /**
     * Registers only — the listener is NOT called synchronously. Callers read
     * the current value with `snapshot()`; React requires a store's subscribe
     * not to fire during subscription.
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshot: view,

    async openSession(stakeBase) {
      if (destroyed) throw new Error('demo host destroyed');
      if (stakeBase < DEMO_MIN_STAKE) throw new Error('stake below the minimum');
      if (stakeBase > purse) throw new Error('stake exceeds the purse');
      if (session && !session.isSettled) throw new Error('a round is already open');

      purse -= stakeBase; // escrowed, exactly as the facet pulls the wager
      sessionCounter += 1;
      session = {
        sessionKey: `demo-${sessionCounter}`,
        sessionId: String(sessionCounter),
        phase: 'waiting-randomness',
        inch: 1,
        lotId: null,
        stakeBase,
        payoutBase: 0n,
        isSettled: false,
        error: null,
      };
      emit();
      scheduleReveal();
    },

    async submitAction(action: PlayerAction) {
      if (destroyed) throw new Error('demo host destroyed');
      if (!session || session.phase !== 'waiting-player' || session.lotId === null) {
        throw new Error('there is no lot on the table');
      }
      const { inch, lotId, stakeBase } = session;

      if (action === 'CLAIM') {
        const payout = payoutBase(stakeBase, lotById(lotId).faceBp, inch);
        purse += payout;
        patch({ phase: 'settled', payoutBase: payout, isSettled: true });
        return;
      }

      if (inch >= INCHES) throw new Error('the fifth inch has no exit but a claim');
      patch({ inch: inch + 1, lotId: null, phase: 'waiting-randomness' });
      scheduleReveal();
    },

    async revealOutcome() {
      // The demo draws its own balance, so there is nothing for the host to unhide.
    },

    dealAgain() {
      if (session?.isSettled) {
        session = null;
        emit();
      }
    },

    refill() {
      if (destroyed) return;
      if (session && !session.isSettled) return;
      purse = DEMO_OPENING_PURSE;
      emit();
    },

    destroy() {
      destroyed = true;
      if (pending !== null) clearTimeout(pending);
      pending = null;
      listeners.clear();
    },
  };
}
