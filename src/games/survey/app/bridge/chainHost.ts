/**
 * THE SURVEY inside the chain.wtf host (docs.md §4.1).
 *
 * The bridge itself — penpal, the session feed, the stake ceiling, the reveal
 * handshake — is `shared/bridge/chain.ts` and is the same code CANDLE runs. What
 * is left here is the only part that is this game's: how a session row reads as
 * a manifest and a margin, and where the Ghost Report comes from.
 *
 * The contract is the only authority. Everything shown is DECODED from the five
 * bytes of `raw.gameState` the facet emitted and from the payout on the row.
 * Nothing here re-draws a report, re-decides a condition, or recomputes a
 * payout — and in particular the client never learns whether she was sound
 * except by the payout the chain already paid.
 */
import { MAX_VALUE_BP, VALUE_DENOM, CARGOES, MAX_SURVEYS, type CargoId, type Report } from '../../core/vessel';
import { drawReport } from '../../core/draw';
import { createPrng, seedFromCrypto } from '../../../../shared/bridge/prng';
import { createChainHost } from '../../../../shared/bridge/chain';
import {
  decodeSurveyState,
  encodeSurveyAction,
  PHASE_COMMITTED,
  PHASE_WEIGHING,
  type SurveyAction,
  type SurveyHost,
  type SurveySessionView,
} from './types';

const MAX_MULTIPLIER_X = MAX_VALUE_BP / VALUE_DENOM; // 20

function cargoIdForValueBp(valueBp: number): CargoId | null {
  const cargo = CARGOES.find(c => c.valueBp === valueBp);
  return cargo ? cargo.id : null;
}

export type SurveyChainOptions = {
  /** Stake the control opens on, in whole tokens. */
  readonly defaultStakeWhole?: number;
  readonly minStakeWhole?: number;
};

export function createSurveyChainHost(options: SurveyChainOptions = {}): SurveyHost {
  /**
   * The Ghost Report is drawn HERE, in the client, once the call is already
   * locked in. It is not on chain and the UI says so: putting it there would
   * mean one more VRF word between the call and the payout, and
   * `cancelStuckRandomness` refunds only the escrowed stake — a stuck word after
   * a 20x win would wipe it out. Same predictive distribution, same rejection
   * sampler, so the draw is the real one; it just settles nothing (docs.md §6.4).
   */
  const ghostPrng = createPrng(seedFromCrypto());
  const ghosts = new Map<string, Report | null>();

  const ghostFor = (key: string, margin: number, surveys: number): Report | null => {
    if (surveys >= MAX_SURVEYS) return null; // nobody was left to send
    const existing = ghosts.get(key);
    if (existing !== undefined) return existing;
    const report = drawReport(margin, ghostPrng.nextWord(), 0, () => ghostPrng.nextWord()).report;
    ghosts.set(key, report);
    return report;
  };

  /**
   * The margin as it stood on the previous snapshot, so the UI can show WHICH
   * WAY the newest report went. The margin itself is the state — this is only
   * for the beat that draws the slip landing.
   */
  const lastMargin = new Map<string, number>();

  return createChainHost<SurveySessionView, SurveyAction>({
    maxMultiplierX: MAX_MULTIPLIER_X,
    ...(options.defaultStakeWhole !== undefined ? { defaultStakeWhole: options.defaultStakeWhole } : {}),
    ...(options.minStakeWhole !== undefined ? { minStakeWhole: options.minStakeWhole } : {}),
    encodeAction: encodeSurveyAction,

    mapSession({ sessionKey, row, phase, stakeBase, isSettled, error }) {
      const blank: SurveySessionView = {
        sessionKey,
        sessionId: row?.sessionId ?? null,
        phase,
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
        error,
      };

      // openSession has returned but the row has not reached the feed yet.
      if (!row) return blank;

      const state = decodeSurveyState(row.raw.gameState);
      if (!state) return { ...blank, isSettled, error };

      let payoutBase = 0n;
      try {
        payoutBase = BigInt(row.payout ?? '0');
      } catch {
        payoutBase = 0n;
      }

      // Which way the newest report went, by comparing against the last margin
      // we saw on this session. Presentation only; nothing is decided from it.
      const previous = lastMargin.get(sessionKey);
      const lastReport: Report | null =
        previous === undefined || previous === state.margin ? null : state.margin > previous ? 'SOUND' : 'ROTTEN';
      lastMargin.set(sessionKey, state.margin);

      /**
       * The call, read from the contract's own phase byte. COMMITTED means
       * UNDERWRITE was submitted; a settled session still in WEIGHING was
       * DECLINED, because that is the only action that settles without ever
       * leaving the weighing phase.
       */
      const call = state.phase === PHASE_COMMITTED ? 'UNDERWRITE' : isSettled && state.phase === PHASE_WEIGHING ? 'DECLINE' : null;

      return {
        sessionKey,
        sessionId: row.sessionId,
        phase,
        cargoId: state.valueBp > 0 ? cargoIdForValueBp(state.valueBp) : null,
        surveys: state.surveys,
        margin: state.margin,
        lastReport,
        // A surveyor is out exactly when the facet is waiting on a word in the
        // weighing phase: the cargo is already known and nothing else is pending.
        surveyorOut: phase === 'waiting-randomness' && state.phase === PHASE_WEIGHING && state.valueBp > 0,
        call,
        /**
         * She was sound if and only if the chain paid an underwriting. We do not
         * re-draw her condition to find out — the payout the contract wrote is
         * the only evidence, and a decline never produced one at all.
         */
        wasSound: isSettled && call === 'UNDERWRITE' ? payoutBase > 0n : null,
        stakeBase,
        payoutBase,
        isSettled,
        ghostReport: isSettled && call !== null ? ghostFor(sessionKey, state.margin, state.surveys) : null,
        error,
      };
    },
  });
}
