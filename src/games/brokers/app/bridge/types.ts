/**
 * THE BROKERS' own session, and the five bytes the contract carries it in.
 *
 * The game-agnostic half — the wallet, the token, the purse, `GameHost` itself —
 * is `shared/bridge/host.ts`, the same object CANDLE and THE SURVEY use. What is
 * here is only what shopping a claim needs.
 *
 * **The best price in hand is the state.** Not the list of prices: every price
 * named stays available, so you would only ever take the best one, and what the
 * others said cannot change a decision. The list is carried anyway — but for the
 * UI, which has to show you the floor you are standing on, and never for a
 * decision.
 */
import type { BrokerId } from '../../core/market';
import type { BaseSessionView, GameHost, HostViewOf } from '../../../../shared/bridge/host';

/** A price somebody has named. `brokerId` is null for the house's own man. */
export type NamedPrice = {
  readonly brokerId: BrokerId | null;
  readonly priceBp: number;
};

export type BrokersSessionView = BaseSessionView & {
  /** Every price named so far, in the order they were named. UI only. */
  readonly named: readonly NamedPrice[];
  /** The best price in hand. Recall: it never goes down. 0 before the house speaks. */
  readonly bestBp: number;
  /** Which brokers have been asked. Their fees follow from it and nothing else. */
  readonly askedMask: number;
  /** The broker whose word is in flight, or null. */
  readonly waitingOn: BrokerId | null;
  /**
   * The Ghost Price: what one of the brokers you did NOT ask would have said
   * (prd.md §2, the Ghost Lot's cousin).
   *
   * Drawn only once the claim is sold, so it cannot have influenced the call,
   * and it changes no payout. Null when you asked everybody — there was nobody
   * left, and inventing one would be a lie.
   *
   * Drawn in the client, never on chain, and the UI says so (docs.md §6.4).
   */
  readonly ghost: NamedPrice | null;
};

export type BrokersView = HostViewOf<BrokersSessionView>;

/** Ask a named broker, or take the best price in hand. */
export type BrokersAction = { readonly kind: 'ASK'; readonly brokerId: BrokerId } | { readonly kind: 'TAKE' };

export type BrokersHost = GameHost<BrokersSessionView, BrokersAction>;

/** `0x00`..`0x03` ask that broker; `0x04` takes what is in hand. */
export const ACTION_TAKE = 4;

export function encodeBrokersAction(action: BrokersAction): `0x${string}` {
  const byte = action.kind === 'TAKE' ? ACTION_TAKE : action.brokerId;
  return `0x${byte.toString(16).padStart(2, '0')}`;
}

export const PHASE_OPENING = 0;
export const PHASE_SHOPPING = 1;
/** The `pending` byte when nobody is looking at the claim. */
export const NOBODY = 0xff;

/**
 * `abi.encodePacked(uint16 bestBp, uint8 askedMask, uint8 pending, uint8 phase)`
 * — the 5-byte `gameState` the contract emits on every step and the host hands
 * back in `raw.gameState`. Decoding it is how the guest recovers a round after a
 * reload, and the only way it ever learns where a session stands.
 */
export type BrokersGameState = {
  readonly bestBp: number;
  readonly askedMask: number;
  /** 0..3, or null when nobody is looking. */
  readonly pending: BrokerId | null;
  readonly phase: number;
};

export function encodeBrokersState(bestBp: number, askedMask: number, pending: number, phase: number): `0x${string}` {
  return `0x${bestBp.toString(16).padStart(4, '0')}${askedMask.toString(16).padStart(2, '0')}${pending
    .toString(16)
    .padStart(2, '0')}${phase.toString(16).padStart(2, '0')}`;
}

export function decodeBrokersState(hex: string | undefined | null): BrokersGameState | null {
  if (!hex) return null;
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (body.length !== 10 || !/^[0-9a-fA-F]{10}$/.test(body)) return null;
  const phase = parseInt(body.slice(8, 10), 16);
  if (phase > PHASE_SHOPPING) return null;
  const pendingByte = parseInt(body.slice(6, 8), 16);
  return {
    bestBp: parseInt(body.slice(0, 4), 16),
    askedMask: parseInt(body.slice(4, 6), 16),
    pending: pendingByte === NOBODY ? null : ((pendingByte & 0x03) as BrokerId),
    phase,
  };
}
