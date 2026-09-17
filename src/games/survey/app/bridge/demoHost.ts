/**
 * THE SURVEY, standing alone (docs.md §4.2).
 *
 * Implements the identical `SurveyHost` interface with a seeded PRNG, so the UI
 * has exactly one code path and free play cannot drift into being a different
 * game. Three things make that a real claim rather than a hope:
 *
 *  - every draw goes through `core/draw.ts`, the same rejection sampler and the
 *    same exact thresholds the contract uses;
 *  - every transition goes through `core/round.ts`, the same state machine the
 *    parity tests drive against the deployed Solidity;
 *  - **the generative order is the contract's.** Reports come from the
 *    predictive distribution as they are asked for; the ship's condition is
 *    drawn only once UNDERWRITE is locked in. The demo cannot know she is rotten
 *    before the player commits, because at that moment nothing has decided it.
 *
 * **No browser storage.** `localStorage` and `sessionStorage` are forbidden
 * (claude.md §7): a purse that looks like it survives a reload and does not is a
 * worse lie than one that obviously resets. The purse lives for exactly one page
 * load and `REFILL` is right there.
 */
import { MAX_SURVEYS, type Report } from '../../core/vessel';
import { drawCargo, drawReport, drawReportGiven, drawCondition } from '../../core/draw';
import { openRound, transition, declinePayout, underwritePayout, type RoundState } from '../../core/round';
import { dwellWithTurbo } from '../audio/voice';
import { createPrng, seedFromCrypto, type Prng } from '../../../../shared/bridge/prng';
import { createViewStore } from '../../../../shared/bridge/host';
import type { SurveyAction, SurveyHost, SurveySessionView, SurveyView } from './types';

/** 18 decimals, like the production token, so the arithmetic matches exactly. */
const DECIMALS = 18;
const ONE = 10n ** BigInt(DECIMALS);

export const DEMO_OPENING_PURSE = 2_000n * ONE;
export const DEMO_DEFAULT_STAKE = 20n * ONE;
export const DEMO_MIN_STAKE = 1n * ONE;

export type DemoSurveyOptions = {
  /** Fixed seed for tests. Omitted in the browser, where it comes from crypto. */
  readonly seed?: readonly [number, number, number, number];
  /** Set to 0 in tests to settle synchronously. */
  readonly randomnessDelayMs?: number;
  /** Turbo collapses the pacing without changing a single decision. */
  readonly turbo?: boolean;
};

export function createDemoSurveyHost(options: DemoSurveyOptions = {}): SurveyHost {
  const prng: Prng = createPrng(options.seed ?? seedFromCrypto());
  /**
   * `undefined` means "pace it from the numbers" (plan.md D4). A fixed value is
   * for tests, which must not wait on a knife edge to find out what happened.
   */
  const fixedDelay = options.randomnessDelayMs;
  let turbo = options.turbo ?? false;

  let purse = DEMO_OPENING_PURSE;
  let round: RoundState | null = null;
  let session: SurveySessionView | null = null;
  let sessionCounter = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const store = createViewStore<SurveyView>(() => ({
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
  }));

  const patch = (next: Partial<SurveySessionView>) => {
    if (!session) return;
    session = { ...session, ...next };
    store.emit();
  };

  /** One fresh word per step, exactly as one VRF word arrives per step. */
  const word = () => prng.nextWord();
  const rehash = () => prng.nextWord();

  /**
   * The Ghost Report: what the NEXT surveyor would have said.
   *
   * Drawn only once the call is already locked in, so it cannot have leaked
   * into the decision and it settles nothing. Null when all five have reported:
   * there was no next surveyor, and inventing one would be a lie.
   *
   * WHICH distribution depends on whether the voyage has a truth yet. After a
   * DECLINE nothing was ever drawn about her, so the honest ghost is the
   * predictive one — the same draw the contract would have made for a sixth
   * surveyor. After an UNDERWRITE she has been resolved, and the ghost is a
   * reading of THAT condition, right three times in five like every surveyor
   * before him.
   *
   * Drawing the predictive one in both cases — which this host did — leaves the
   * ghost independent of the outcome the player has just watched, so a ship that
   * came home sound got a "next surveyor" who agreed with her no more often than
   * a coin. It changed no payout. It did quietly break the one thing this game
   * claims, which is that its beliefs hang together.
   */
  const drawGhost = (margin: number, surveys: number, wasSound: boolean | null): Report | null => {
    if (surveys >= MAX_SURVEYS) return null;
    return wasSound === null
      ? drawReport(margin, word(), 0, rehash).report
      : drawReportGiven(wasSound, word(), 0, rehash).report;
  };

  /** Settle a finished round: pay the purse, freeze the view. */
  const settle = (next: RoundState, call: 'UNDERWRITE' | 'DECLINE', wasSound: boolean | null) => {
    round = next;
    purse += next.payoutBase;
    patch({
      phase: 'settled',
      surveys: next.surveys,
      margin: next.margin,
      surveyorOut: false,
      call,
      wasSound,
      payoutBase: next.payoutBase,
      isSettled: true,
      ghostReport: drawGhost(next.margin, next.surveys, wasSound),
    });
  };

  /**
   * Waits, then applies a step. The wait is DERIVED, not scripted: `dwellMs`
   * asks how close this state sits to the DP's own indifference point, so the
   * room moves briskly through a call that is not a decision and holds on the
   * one that is. Nothing is hidden by it — the player cannot act until the step
   * lands either way.
   */
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

  /** The opening word: which cargo the voyage carries. */
  const revealCargo = () => {
    if (destroyed || !round || !session) return;
    const cargo = drawCargo(word(), 0, rehash).cargo;
    const next = transition(round, { type: 'OFFER', cargoId: cargo.id });
    const wait = dwellWithTurbo(cargo, 0, 0, turbo);
    after(wait, () => {
      if (destroyed || !session) return;
      round = next;
      patch({ cargoId: cargo.id, phase: 'waiting-player', surveyorOut: false });
    });
  };

  /** A surveyor goes aboard; his report is the word that comes back. */
  const sendSurveyor = () => {
    if (destroyed || !round || !session || round.cargo === null) return;
    // The word is generated HERE, after SURVEY is already locked in — the demo's
    // mirror of invariant I4.
    const report = drawReport(round.margin, word(), 0, rehash).report;
    const wait = dwellWithTurbo(round.cargo, round.surveys, round.margin, turbo);
    const current = round;

    patch({ phase: 'waiting-randomness', surveyorOut: true });
    after(wait, () => {
      if (destroyed || !session) return;
      const next = transition(current, { type: 'REPORT', report });
      round = next;
      patch({
        phase: 'waiting-player',
        surveys: next.surveys,
        margin: next.margin,
        lastReport: report,
        surveyorOut: false,
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
      if (session && !session.isSettled) throw new Error('a voyage is already open');

      purse -= stakeBase; // escrowed, exactly as the facet pulls the wager
      sessionCounter += 1;
      round = openRound(stakeBase);
      session = {
        sessionKey: `demo-${sessionCounter}`,
        sessionId: String(sessionCounter),
        phase: 'waiting-randomness',
        cargoId: null,
        surveys: 0,
        margin: 0,
        lastReport: null,
        surveyorOut: false,
        call: null,
        wasSound: null,
        ghostReport: null,
        stakeBase,
        payoutBase: 0n,
        isSettled: false,
        error: null,
      };
      store.emit();
      revealCargo();
    },

    async submitAction(action: SurveyAction) {
      if (destroyed) throw new Error('demo host destroyed');
      if (!round || !session || session.phase !== 'waiting-player' || round.cargo === null) {
        throw new Error('there is nothing to weigh');
      }

      if (action === 'SURVEY') {
        if (round.surveys >= MAX_SURVEYS) throw new Error('there is nobody left to send');
        transition(round, { type: 'SURVEY' }); // throws if it is not legal
        sendSurveyor();
        return;
      }

      if (action === 'DECLINE') {
        // No word is needed: declining pays the same whatever she was, which is
        // exactly why walking away can never be left hanging on randomness.
        settle(transition(round, { type: 'DECLINE' }), 'DECLINE', null);
        return;
      }

      // UNDERWRITE: commit first, and only then is her condition drawn.
      const cargo = round.cargo;
      const committed = transition(round, { type: 'UNDERWRITE' });
      round = committed;
      patch({ phase: 'waiting-randomness', call: 'UNDERWRITE' });

      // The word that decides her does not exist until this line, which is
      // after the call is locked in and emitted (claude.md I4).
      const isSound = drawCondition(committed.margin, word(), 0, rehash).isSound;
      const wait = dwellWithTurbo(cargo, committed.surveys, committed.margin, turbo);
      after(wait, () => {
        if (destroyed || !session) return;
        settle(transition(committed, { type: 'RESOLVE', isSound }), 'UNDERWRITE', isSound);
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

/** What underwriting or declining would pay right now, for the switches. */
export { declinePayout, underwritePayout };
