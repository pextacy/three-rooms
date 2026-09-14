/**
 * The one shape the UI knows about (docs.md §1).
 *
 * With a host present the contract is the only authority on outcomes; without
 * one, `demoHost` synthesises the same message shapes from a seeded PRNG. Both
 * implement `CandleHost`, so the UI has exactly ONE code path and the demo
 * cannot quietly drift into being a different game.
 */
import type { LotId } from '../game/paytable';

export type HostKind = 'chain' | 'demo';

/** Mirrors `SessionPhase` in ICasinoGameV2, plus a local pre-chain state. */
export type SessionPhase =
  | 'opening'
  | 'waiting-randomness'
  | 'waiting-player'
  | 'settled'
  | 'forfeited'
  | 'cancelled';

export type SessionView = {
  readonly sessionKey: string;
  readonly sessionId: string | null;
  readonly phase: SessionPhase;
  /** 1..INCHES. */
  readonly inch: number;
  /** The lot on the table, or null while a word is in flight. */
  readonly lotId: LotId | null;
  readonly stakeBase: bigint;
  /** Meaningful once the phase is terminal. */
  readonly payoutBase: bigint;
  /** True once the round has settled and the payout may be shown. */
  readonly isSettled: boolean;
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

export type WalletStatus = 'ready' | 'disconnected' | 'setup-required' | 'session-key-mismatch';

export type HostView = {
  readonly kind: HostKind;
  /**
   * True once a host has actually answered — the penpal handshake resolved, or
   * a snapshot arrived. Distinct from `canBet`: a host can be connected and
   * still have no wallet ready to bet with.
   */
  readonly connected: boolean;
  /** False until the bridge has a host and a wallet that can bet. */
  readonly canBet: boolean;
  readonly walletStatus: WalletStatus;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  /**
   * Play-chip purse. **Demo only.** Inside a host the HOST owns and draws the
   * balance and the game must not render a second one (docs.md §4.1).
   */
  readonly purseBase: bigint | null;
  readonly minStakeBase: bigint;
  /** Clamped to what `openSession` would accept right now, or null if unknown. */
  readonly maxStakeBase: bigint | null;
  readonly defaultStakeBase: bigint;
  readonly theme: 'light' | 'dark' | 'system';
  readonly session: SessionView | null;
  /** Present only when the host cannot be reached at all. */
  readonly fatal: string | null;
};

export type PlayerAction = 'CLAIM' | 'BURN';

export type CandleHost = {
  readonly kind: HostKind;
  /** Pushes a new view on every change. Returns an unsubscribe. */
  subscribe(listener: (view: HostView) => void): () => void;
  snapshot(): HostView;
  openSession(stakeBase: bigint): Promise<void>;
  submitAction(action: PlayerAction): Promise<void>;
  /**
   * Tell the host the reveal animation has landed. Until this is called the host
   * hides the payout from its balance display so the top bar cannot spoil the
   * result (docs.md §7.3.10). Harmless no-op in demo.
   */
  revealOutcome(): Promise<void>;
  /** Clear a settled round so the next one can be dealt. */
  dealAgain(): void;
  /**
   * Collapse the pacing. Turbo changes how long the game waits, never what the
   * player has to decide — an autoplayer would be an admission that the decision
   * is fake (claude.md §7), and this is not one.
   */
  setTurbo?(turbo: boolean): void;
  /** Demo only — restores the opening purse. Absent inside a host. */
  refill?(): void;
  destroy(): void;
};

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
