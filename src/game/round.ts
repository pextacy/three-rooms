/**
 * The round state machine (docs.md §2.5).
 *
 *           stake set
 *               │
 *               ▼
 *         ┌───────────┐   word_k
 *         │    LIT    │──────────────┐
 *         └───────────┘              ▼
 *                               ┌──────────┐
 *               ┌───────────────│ OFFERED  │
 *               │  CLAIM        │  inch k  │
 *               ▼               └────┬─────┘
 *         ┌───────────┐   BURN       │ (k < 5)
 *         │  CLAIMED  │◀─────────────┘
 *         └───────────┘        k := k+1, request word_{k+1}
 *               ▲
 *               │ (k == 5, forced)
 *         ┌───────────┐
 *         │ GUTTERED  │
 *         └───────────┘
 *
 * Legal transitions only. Every other input is **rejected, not ignored**, and
 * each rejection is a test case.
 *
 * Pure: `(state, input) -> state`. No DOM, no randomness, no clock. The caller
 * supplies the drawn lot; this file never draws one.
 *
 * A note on the fifth inch. The contract compresses the reveal and the forced
 * claim into a single `onRandomness` call, so on chain the session never
 * re-enters `WAITING_PLAYER_ACTION` at inch 5 and `BURN` there is unreachable.
 * This machine keeps the two steps apart so the UI can show the last lot land
 * before the candle gutters — which is what makes `BURN` at inch 5 a state the
 * machine must actually refuse.
 */
import { INCHES, payoutBase, waxBpAt } from './wax';
import { lotById, type Lot, type LotId } from './paytable';

export type Phase = 'LIT' | 'OFFERED' | 'CLAIMED' | 'GUTTERED';

export type RoundState = {
  readonly phase: Phase;
  /** 1..INCHES. The inch whose lot is on the table, or that is being drawn for. */
  readonly inch: number;
  /** The lot on the table. Present exactly when the phase is not LIT. */
  readonly lot: Lot | null;
  /** Stake in the token's base units. Fixed for the life of the round. */
  readonly stakeBase: bigint;
  /** Settled payout in base units. Meaningful only in a terminal phase. */
  readonly payoutBase: bigint;
  /**
   * True once the machine is at the last inch, where the only exit is a claim.
   * The UI reads this to print "the candle is guttering" before the settle.
   */
  readonly forced: boolean;
};

export type RoundInput =
  | { readonly type: 'OFFER'; readonly lotId: LotId }
  | { readonly type: 'CLAIM' }
  | { readonly type: 'BURN' };

export class RoundTransitionError extends Error {
  constructor(
    readonly state: RoundState,
    readonly input: RoundInput,
    reason: string,
  ) {
    super(`${input.type} is illegal from ${state.phase} at inch ${state.inch}: ${reason}`);
    this.name = 'RoundTransitionError';
  }
}

export function isTerminal(state: RoundState): boolean {
  return state.phase === 'CLAIMED' || state.phase === 'GUTTERED';
}

/** Light the candle. The first lot has not been drawn yet. */
export function lightCandle(stakeBase: bigint): RoundState {
  if (stakeBase <= 0n) throw new RangeError('stake must be positive');
  return { phase: 'LIT', inch: 1, lot: null, stakeBase, payoutBase: 0n, forced: false };
}

/** What the lot on the table is worth right now, in base units. */
export function payoutIfClaimedNow(state: RoundState): bigint {
  if (state.lot === null) return 0n;
  return payoutBase(state.stakeBase, state.lot.faceBp, state.inch);
}

/** Wax remaining at the current inch, in basis points. Drives the light model. */
export function waxNow(state: RoundState): number {
  return waxBpAt(state.inch);
}

export function transition(state: RoundState, input: RoundInput): RoundState {
  switch (input.type) {
    case 'OFFER': {
      if (state.phase !== 'LIT') {
        throw new RoundTransitionError(state, input, 'a lot is already on the table');
      }
      const lot = lotById(input.lotId);
      return {
        ...state,
        phase: 'OFFERED',
        lot,
        forced: state.inch >= INCHES,
      };
    }

    case 'CLAIM': {
      if (state.phase !== 'OFFERED') {
        throw new RoundTransitionError(state, input, 'there is no lot on the table to claim');
      }
      const lot = state.lot;
      if (lot === null) throw new RoundTransitionError(state, input, 'OFFERED with no lot — corrupt state');
      return {
        ...state,
        // At the last inch the claim is not a decision, so it settles as a
        // gutter. The payout rule is identical; only the name differs, and the
        // name is what the copy reads.
        phase: state.forced ? 'GUTTERED' : 'CLAIMED',
        payoutBase: payoutBase(state.stakeBase, lot.faceBp, state.inch),
      };
    }

    case 'BURN': {
      if (state.phase !== 'OFFERED') {
        throw new RoundTransitionError(state, input, 'there is no lot on the table to refuse');
      }
      if (state.inch >= INCHES) {
        throw new RoundTransitionError(state, input, 'the fifth inch has no exit but a claim');
      }
      return { ...state, phase: 'LIT', inch: state.inch + 1, lot: null, forced: false };
    }

    default: {
      // Exhaustive: `input` is `never` here if every case is handled.
      const unreachable: never = input;
      throw new Error(`unknown input: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** Convenience for tests and the demo host: the legal inputs from a state. */
export function legalInputs(state: RoundState): readonly RoundInput['type'][] {
  if (state.phase === 'LIT') return ['OFFER'];
  if (state.phase === 'OFFERED') return state.inch >= INCHES ? ['CLAIM'] : ['CLAIM', 'BURN'];
  return [];
}
