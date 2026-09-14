/**
 * The round state machine for THE SURVEY.
 *
 *            stake set
 *                │
 *                ▼
 *          ┌───────────┐  cargo drawn
 *          │  OFFERED  │──────────────┐
 *          └───────────┘              ▼
 *                                ┌──────────┐
 *              ┌─────────────────│ WEIGHING │◀────────┐
 *              │   DECLINE       │  k, m    │         │ report, k := k+1
 *              ▼                 └────┬─────┘         │
 *        ┌───────────┐   UNDERWRITE   │  SURVEY (k<K) │
 *        │ DECLINED  │                ├───────────────┘
 *        └───────────┘                ▼
 *                              ┌─────────────┐  she was sound?
 *                              │  COMMITTED  │──────────────┐
 *                              └─────────────┘              ▼
 *                                                    ┌────────────┐
 *                                                    │  SETTLED   │
 *                                                    └────────────┘
 *
 * `SURVEY` at the last surveyor is **illegal** — there is nobody left to send.
 * `DECLINE` settles at once and needs no further randomness: it pays the same
 * whatever the ship turns out to be, which is exactly why walking away is safe.
 * `UNDERWRITE` commits, and only then is the ship's condition drawn.
 *
 * Pure: `(state, input) -> state`. No DOM, no randomness, no clock.
 */
import { MAX_SURVEYS, DECLINE_BP, payoutBase, cargoById, type Cargo, type CargoId, type Call, type Report } from './vessel';

export type Phase = 'OFFERED' | 'WEIGHING' | 'COMMITTED' | 'SETTLED' | 'DECLINED';

export type RoundState = {
  readonly phase: Phase;
  readonly cargo: Cargo | null;
  /** How many surveyors have reported. 0..MAX_SURVEYS. */
  readonly surveys: number;
  /** Reports for sound minus reports for rot. The whole of what is known. */
  readonly margin: number;
  /** Every report, in order — for the UI only; the margin is the state. */
  readonly reports: readonly Report[];
  readonly stakeBase: bigint;
  readonly payoutBase: bigint;
  /** Set once the voyage is over. Null while it is still anybody's guess. */
  readonly wasSound: boolean | null;
};

export type RoundInput =
  | { readonly type: 'OFFER'; readonly cargoId: CargoId }
  | { readonly type: 'SURVEY' }
  | { readonly type: 'REPORT'; readonly report: Report }
  | { readonly type: 'UNDERWRITE' }
  | { readonly type: 'DECLINE' }
  | { readonly type: 'RESOLVE'; readonly isSound: boolean };

export class RoundTransitionError extends Error {
  constructor(
    readonly state: RoundState,
    readonly input: RoundInput,
    reason: string,
  ) {
    super(`${input.type} is illegal from ${state.phase} after ${state.surveys} surveys: ${reason}`);
    this.name = 'RoundTransitionError';
  }
}

export function openRound(stakeBase: bigint): RoundState {
  if (stakeBase <= 0n) throw new RangeError('stake must be positive');
  return { phase: 'OFFERED', cargo: null, surveys: 0, margin: 0, reports: [], stakeBase, payoutBase: 0n, wasSound: null };
}

export function isTerminal(state: RoundState): boolean {
  return state.phase === 'SETTLED' || state.phase === 'DECLINED';
}

/** What underwriting would pay if she comes home. */
export function underwritePayout(state: RoundState): bigint {
  if (!state.cargo) return 0n;
  return payoutBase(state.stakeBase, state.cargo.valueBp, state.surveys);
}

/** What declining pays, whatever she turns out to be. */
export function declinePayout(state: RoundState): bigint {
  return payoutBase(state.stakeBase, DECLINE_BP, state.surveys);
}

export function transition(state: RoundState, input: RoundInput): RoundState {
  switch (input.type) {
    case 'OFFER': {
      if (state.phase !== 'OFFERED' || state.cargo !== null) {
        throw new RoundTransitionError(state, input, 'the manifest is already on the table');
      }
      return { ...state, phase: 'WEIGHING', cargo: cargoById(input.cargoId) };
    }

    case 'SURVEY': {
      if (state.phase !== 'WEIGHING') throw new RoundTransitionError(state, input, 'there is nothing to survey');
      if (state.surveys >= MAX_SURVEYS) {
        throw new RoundTransitionError(state, input, 'there is nobody left to send');
      }
      return state; // the report arrives separately; the contract requests a word here
    }

    case 'REPORT': {
      if (state.phase !== 'WEIGHING') throw new RoundTransitionError(state, input, 'no surveyor is out');
      if (state.surveys >= MAX_SURVEYS) throw new RoundTransitionError(state, input, 'every surveyor has reported');
      return {
        ...state,
        surveys: state.surveys + 1,
        margin: state.margin + (input.report === 'SOUND' ? 1 : -1),
        reports: [...state.reports, input.report],
      };
    }

    case 'DECLINE': {
      if (state.phase !== 'WEIGHING') throw new RoundTransitionError(state, input, 'there is no risk to decline');
      // No further randomness: declining pays the same whatever she was, which
      // is why it can settle immediately and can never be left hanging on a word.
      return { ...state, phase: 'DECLINED', payoutBase: declinePayout(state) };
    }

    case 'UNDERWRITE': {
      if (state.phase !== 'WEIGHING') throw new RoundTransitionError(state, input, 'there is no risk to take');
      if (state.cargo === null) throw new RoundTransitionError(state, input, 'WEIGHING with no cargo — corrupt state');
      return { ...state, phase: 'COMMITTED' };
    }

    case 'RESOLVE': {
      if (state.phase !== 'COMMITTED') {
        throw new RoundTransitionError(state, input, 'the voyage cannot be resolved before it is underwritten');
      }
      if (state.cargo === null) throw new RoundTransitionError(state, input, 'COMMITTED with no cargo — corrupt state');
      return {
        ...state,
        phase: 'SETTLED',
        wasSound: input.isSound,
        payoutBase: input.isSound ? underwritePayout(state) : 0n,
      };
    }

    default: {
      const unreachable: never = input;
      throw new Error(`unknown input: ${JSON.stringify(unreachable)}`);
    }
  }
}

export function legalInputs(state: RoundState): readonly RoundInput['type'][] {
  if (state.phase === 'OFFERED') return ['OFFER'];
  if (state.phase === 'WEIGHING') {
    return state.surveys < MAX_SURVEYS ? ['SURVEY', 'UNDERWRITE', 'DECLINE'] : ['UNDERWRITE', 'DECLINE'];
  }
  if (state.phase === 'COMMITTED') return ['RESOLVE'];
  return [];
}

/** How the reports read, for the copy: "two to one for rot". */
export function tally(state: RoundState): { readonly sound: number; readonly rotten: number } {
  const sound = state.reports.filter(r => r === 'SOUND').length;
  return { sound, rotten: state.reports.length - sound };
}

export type { Call };
