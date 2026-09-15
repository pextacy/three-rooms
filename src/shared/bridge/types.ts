/**
 * CANDLE's own session, and the four bytes the contract carries it in.
 *
 * The game-agnostic half — the wallet, the token, the purse, the `GameHost`
 * interface itself — lives in `host.ts` and is shared with THE SURVEY. What is
 * here is only what an auction by the inch needs: which inch it is, which lot is
 * on the table, and the Ghost Lot.
 */
import type { LotId } from '../../games/candle/core/paytable';
import type { BaseSessionView, GameHost, HostViewOf } from './host';

export type { HostKind, SessionPhase, WalletStatus } from './host';
export { createViewStore, toBigInt } from './host';

export type SessionView = BaseSessionView & {
  /** 1..INCHES. */
  readonly inch: number;
  /** The lot on the table, or null while a word is in flight. */
  readonly lotId: LotId | null;

  /**
   * The Ghost Lot: the lot that WOULD have come next, had the player let the
   * candle burn one more inch (prd.md §2).
   *
   * Drawn only once the round is already settled, so it cannot have influenced
   * the decision, and it changes no payout. Null on a round that guttered — at
   * the fifth inch there is no next lot, and inventing one would be a lie.
   *
   * **It is drawn in the client, not on chain, and the UI says so.** The
   * alternative — one more VRF word at settlement — would put the payout behind a
   * randomness fulfilment, and `cancelStuckRandomness` refunds only the
   * ESCROWED STAKE. A stuck word after a 25x claim would therefore destroy the
   * win. No retention loop is worth that. See docs.md §6.4.
   */
  readonly ghostLotId: LotId | null;
  /** Set when a step failed; the UI surfaces it instead of hanging. */
  readonly error: string | null;
};

export type HostView = HostViewOf<SessionView>;

export type PlayerAction = 'CLAIM' | 'BURN';

export type CandleHost = GameHost<SessionView, PlayerAction>;

/**
 * `abi.encodePacked(uint8 inch, uint16 faceBp, uint8 hasLot)` — the 4-byte
 * `gameState` the contract emits on every step and the host hands back in
 * `raw.gameState`. Decoding it is how the guest recovers a round after a reload.
 */
export type GameState = {
  readonly inch: number;
  readonly faceBp: number;
  readonly hasLot: boolean;
};

export function encodeGameState(inch: number, faceBp: number, hasLot: boolean): `0x${string}` {
  return `0x${inch.toString(16).padStart(2, '0')}${faceBp.toString(16).padStart(4, '0')}${hasLot ? '01' : '00'}`;
}

export function decodeGameState(hex: string | undefined | null): GameState | null {
  if (!hex) return null;
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (body.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(body)) return null;
  const inch = parseInt(body.slice(0, 2), 16);
  const faceBp = parseInt(body.slice(2, 6), 16);
  const hasLot = parseInt(body.slice(6, 8), 16) === 1;
  if (inch < 1) return null;
  return { inch, faceBp, hasLot };
}

/** `CLAIM` is `0x00`, `BURN` is `0x01` — the contract reads one byte. */
export function encodeAction(action: PlayerAction): `0x${string}` {
  return action === 'CLAIM' ? '0x00' : '0x01';
}
