/**
 * The round state machine for THE BROKERS.
 *
 *              stake set
 *                  │
 *                  ▼
 *            ┌───────────┐  the house names a price
 *            │  OPENING  │──────────────────┐
 *            └───────────┘                  ▼
 *                                    ┌─────────────┐
 *                ┌───────────────────│  SHOPPING   │◀────────┐
 *                │   TAKE            │ mask, best  │         │ QUOTE
 *                ▼                   └──────┬──────┘         │
 *          ┌───────────┐     ASK(i), i unasked │              │
 *          │  SETTLED  │                      ├──────────────┘
 *          └───────────┘                      │
 *                                             ▼ (all four asked)
 *                                       TAKE is the only move
 *
 * `ASK` on a broker already asked is illegal — his price is already on the
 * table and would cost a second fee for nothing. `TAKE` is always legal, which
 * is the point of the game: **nothing is ever lost, and every price you have
 * been named stays available.** With all four asked, `TAKE` is the only move
 * left; there is no forced bad outcome anywhere in this machine.
 *
 * Pure: `(state, input) -> state`. No DOM, no randomness, no clock.
 */
import {
  BROKER_LIST,
  brokerById,
  feesForMask,
  payoutBase,
  type BrokerId,
} from './market';

export type Phase = 'OPENING' | 'SHOPPING' | 'SETTLED';

/** A price somebody has named, and who named it. */
export type Named = {
  /** Null is the house's own man, who is not a broker and charges nothing. */
  readonly brokerId: BrokerId | null;
  readonly priceBp: number;
};

export type RoundState = {
  readonly phase: Phase;
  /** Every price named so far, in the order they were named. */
  readonly named: readonly Named[];
  /** The best price in hand. Recall: it never goes down. */
  readonly bestBp: number;
  /** Which brokers have been asked, as a bitmask. Their fees follow from it. */
  readonly askedMask: number;
  /** The broker whose word is in flight, or null. */
  readonly waitingOn: BrokerId | null;
  readonly stakeBase: bigint;
  readonly payoutBase: bigint;
};

export type RoundInput =
  | { readonly type: 'OPEN'; readonly priceBp: number }
  | { readonly type: 'ASK'; readonly brokerId: BrokerId }
  | { readonly type: 'QUOTE'; readonly priceBp: number }
  | { readonly type: 'TAKE' };

export class RoundTransitionError extends Error {
  constructor(
    readonly state: RoundState,
    readonly input: RoundInput,
    reason: string,
  ) {
    super(`${input.type} is illegal from ${state.phase}: ${reason}`);
    this.name = 'RoundTransitionError';
  }
}

export function openRound(stakeBase: bigint): RoundState {
  if (stakeBase <= 0n) throw new RangeError('stake must be positive');
  return {
    phase: 'OPENING',
    named: [],
    bestBp: 0,
    askedMask: 0,
    waitingOn: null,
    stakeBase,
    payoutBase: 0n,
  };
}

export function isTerminal(state: RoundState): boolean {
  return state.phase === 'SETTLED';
}

/** What the day has cost so far, in basis points of the stake. */
export function feesPaid(state: RoundState): number {
  return feesForMask(state.askedMask);
}

/** What taking the best price in hand would pay, right now. */
export function takePayout(state: RoundState): bigint {
  return payoutBase(state.stakeBase, state.bestBp, feesPaid(state));
}

/** Has this broker already been asked? */
export function hasAsked(state: RoundState, id: BrokerId): boolean {
  return (state.askedMask & (1 << id)) !== 0;
}

/** The brokers who have not been asked yet. */
export function unasked(state: RoundState): readonly BrokerId[] {
  return BROKER_LIST.filter(broker => !hasAsked(state, broker.id)).map(broker => broker.id);
}

export function transition(state: RoundState, input: RoundInput): RoundState {
  switch (input.type) {
    case 'OPEN': {
      if (state.phase !== 'OPENING') {
        throw new RoundTransitionError(state, input, 'the house has already named his price');
      }
      return {
        ...state,
        phase: 'SHOPPING',
        named: [{ brokerId: null, priceBp: input.priceBp }],
        bestBp: input.priceBp,
      };
    }

    case 'ASK': {
      if (state.phase !== 'SHOPPING') throw new RoundTransitionError(state, input, 'there is no claim to shop');
      if (state.waitingOn !== null) throw new RoundTransitionError(state, input, 'a broker is already looking');
      if (hasAsked(state, input.brokerId)) {
        throw new RoundTransitionError(state, input, `${brokerById(input.brokerId).name} has already named his price`);
      }
      // The fee is owed the moment he is asked, whatever he ends up saying.
      return { ...state, askedMask: state.askedMask | (1 << input.brokerId), waitingOn: input.brokerId };
    }

    case 'QUOTE': {
      if (state.phase !== 'SHOPPING' || state.waitingOn === null) {
        throw new RoundTransitionError(state, input, 'nobody is looking at the claim');
      }
      return {
        ...state,
        named: [...state.named, { brokerId: state.waitingOn, priceBp: input.priceBp }],
        // Recall, in one line: the best price in hand can only go up.
        bestBp: input.priceBp > state.bestBp ? input.priceBp : state.bestBp,
        waitingOn: null,
      };
    }

    case 'TAKE': {
      if (state.phase !== 'SHOPPING') throw new RoundTransitionError(state, input, 'there is no price to take');
      if (state.waitingOn !== null) throw new RoundTransitionError(state, input, 'wait for the broker you are paying');
      return { ...state, phase: 'SETTLED', payoutBase: takePayout(state) };
    }

    default: {
      const unreachable: never = input;
      throw new Error(`unknown input: ${JSON.stringify(unreachable)}`);
    }
  }
}

export function legalInputs(state: RoundState): readonly RoundInput['type'][] {
  if (state.phase === 'OPENING') return ['OPEN'];
  if (state.phase === 'SHOPPING') {
    if (state.waitingOn !== null) return ['QUOTE'];
    return unasked(state).length > 0 ? ['ASK', 'TAKE'] : ['TAKE'];
  }
  return [];
}

/** Who named the best price in hand. For the copy, and for the ledger. */
export function holding(state: RoundState): Named | null {
  let best: Named | null = null;
  for (const named of state.named) {
    if (best === null || named.priceBp > best.priceBp) best = named;
  }
  return best;
}
