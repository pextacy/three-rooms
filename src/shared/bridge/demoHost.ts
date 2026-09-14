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
import { drawLot } from '../../games/candle/core/rng';
import { lotById, lotForDraw, type LotId } from '../../games/candle/core/paytable';
import { INCHES, payoutBase } from '../../games/candle/core/wax';
import { createPrng, seedFromCrypto, type Prng } from './prng';
import { dwellWithTurbo } from '../audio/voice';
import type { CandleHost, HostView, PlayerAction, SessionView } from './types';

/** 18 decimals, like the production token, so the arithmetic matches exactly. */
const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

export const DEMO_OPENING_PURSE = 2_000n * ONE;
export const DEMO_DEFAULT_STAKE = 20n * ONE;
export const DEMO_MIN_STAKE = 1n * ONE;

export type DemoHostOptions = {
  /** Fixed seed for tests. Omitted in the browser, where it comes from crypto. */
  readonly seed?: readonly [number, number, number, number];
  /** Set to 0 in tests to settle synchronously. */
  readonly randomnessDelayMs?: number;
  /** Turbo collapses the pacing without changing a single decision. */
  readonly turbo?: boolean;
};

export function createDemoHost(options: DemoHostOptions = {}): CandleHost {
  const prng: Prng = createPrng(options.seed ?? seedFromCrypto());
  /**
   * `undefined` means "pace it from the numbers" (plan.md D4). A fixed value is
   * for tests, which must not wait on a knife edge to find out what happened.
   */
  const fixedDelay = options.randomnessDelayMs;
  let turbo = options.turbo ?? false;

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

  /**
   * The Ghost Lot, drawn from the same PRNG and the same paytable — but only
   * once the round is settled, so it cannot have leaked into the decision.
   * Never after a gutter: there was no next inch.
   */
  const drawGhost = (settledInch: number): LotId | null => {
    if (settledInch >= INCHES) return null;
    return lotForDraw(drawLot(prng.nextWord(), 0, () => prng.nextWord()).value).id;
  };

  /** Draw the lot for the current inch, exactly as `onRandomness` would. */
  const revealLot = (lot: ReturnType<typeof lotForDraw>) => {
    if (destroyed || !session) return;
    const inch = session.inch;

    if (inch >= INCHES) {
      // The candle gutters: whatever is on the table is claimed.
      const payout = payoutBase(session.stakeBase, lot.faceBp, inch);
      purse += payout;
      patch({ lotId: lot.id, phase: 'settled', payoutBase: payout, isSettled: true, ghostLotId: drawGhost(inch) });
      return;
    }
    patch({ lotId: lot.id, phase: 'waiting-player' });
  };

  /**
   * Draws the next lot, then waits before putting it on the table.
   *
   * The wait is DERIVED, not scripted: `dwellMs` asks how close this lot sits to
   * the DP's claim threshold at this inch, so the auctioneer moves briskly past
   * an empty crate and lingers over the 0.50x at the third inch — which is the
   * one lot in the game that is genuinely a coin toss (plan.md D4).
   *
   * Nothing is hidden by the wait: the player cannot act until the lot is on the
   * table either way, so the pacing costs them no decision.
   */
  const scheduleReveal = () => {
    if (pending !== null) clearTimeout(pending);
    if (destroyed || !session) return;

    // The word is generated HERE, after the previous decision is already
    // locked — the demo's mirror of invariant I4.
    const lot = lotForDraw(drawLot(prng.nextWord(), 0, () => prng.nextWord()).value);
    const wait = fixedDelay ?? dwellWithTurbo(lot.faceBp, session.inch, turbo);

    if (wait <= 0) {
      revealLot(lot);
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      revealLot(lot);
    }, wait);
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
        ghostLotId: null,
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
        // The ghost is drawn HERE — after the claim is locked in, never before.
        patch({ phase: 'settled', payoutBase: payout, isSettled: true, ghostLotId: drawGhost(inch) });
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

    setTurbo(value: boolean) {
      turbo = value;
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
