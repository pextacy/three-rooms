/**
 * THE SURVEY's own session, and the five bytes the contract carries it in.
 *
 * The game-agnostic half — the wallet, the token, the purse, `GameHost` itself —
 * is `shared/bridge/host.ts` and is the same object CANDLE uses. What is here is
 * only what underwriting a voyage needs: which cargo is on the manifest, how
 * many surveyors have reported, and what they add up to.
 *
 * **The margin is the state.** Not the list of reports: two reports that
 * disagree cancel exactly (see `core/belief.ts`), so `(surveys, margin)` is a
 * sufficient statistic and the contract carries nothing else. The UI shows a
 * tally rather than a sequence for the same reason — a sequence would imply an
 * order that means nothing.
 */
import type { CargoId, Report, Call } from '../../core/vessel';
import type { BaseSessionView, GameHost, HostViewOf } from '../../../../shared/bridge/host';

export type SurveySessionView = BaseSessionView & {
  /** The cargo on the manifest, or null while the opening word is in flight. */
  readonly cargoId: CargoId | null;
  /** How many surveyors have reported. 0..MAX_SURVEYS. */
  readonly surveys: number;
  /** Reports for sound minus reports for rot. The whole of what is known. */
  readonly margin: number;
  /** What the newest report said, for the beat that draws it landing. */
  readonly lastReport: Report | null;
  /** True while a surveyor is out and the word has not come back. */
  readonly surveyorOut: boolean;
  /** The call, once it is made. Null while the voyage is still open. */
  readonly call: Call | null;
  /**
   * Whether she was sound. Null until the voyage is resolved — and null forever
   * on a DECLINE, because nothing was underwritten and no word was ever drawn.
   * Inventing one would be inventing a result the chain never produced.
   */
  readonly wasSound: boolean | null;
  /**
   * The Ghost Report: what the NEXT surveyor would have said, had one been sent
   * (prd.md §2, the Ghost Lot's twin).
   *
   * Drawn only once the call is locked in, so it cannot have influenced it, and
   * it changes no payout. Null when all five have already reported — there was
   * no next surveyor, and inventing one would be a lie.
   *
   * Drawn in the client, never on chain, and the UI says so: one more VRF word
   * between the call and the payout would put the win behind a randomness
   * fulfilment, and `cancelStuckRandomness` refunds only the escrowed stake
   * (docs.md §6.4).
   */
  readonly ghostReport: Report | null;
};

export type SurveyView = HostViewOf<SurveySessionView>;

/** The three things a player can do. One byte each, read by the contract. */
export type SurveyAction = 'SURVEY' | 'UNDERWRITE' | 'DECLINE';

export type SurveyHost = GameHost<SurveySessionView, SurveyAction>;

/** `SURVEY` is `0x00`, `UNDERWRITE` is `0x01`, `DECLINE` is `0x02`. */
export function encodeSurveyAction(action: SurveyAction): `0x${string}` {
  if (action === 'SURVEY') return '0x00';
  return action === 'UNDERWRITE' ? '0x01' : '0x02';
}

/** The contract's three phases, as it writes them into the fifth byte. */
export const PHASE_AWAITING_CARGO = 0;
export const PHASE_WEIGHING = 1;
export const PHASE_COMMITTED = 2;

/**
 * `abi.encodePacked(uint16 valueBp, uint8 surveys, uint8 margin+128, uint8 phase)`
 * — the 5-byte `gameState` the contract emits on every step and the host hands
 * back in `raw.gameState`. Decoding it is how the guest recovers a round after a
 * reload, and the only way it ever learns where a session stands.
 *
 * The margin is signed and the state is bytes, so it travels biased by 128,
 * exactly as `Survey.sol` writes it.
 */
export type SurveyGameState = {
  readonly valueBp: number;
  readonly surveys: number;
  readonly margin: number;
  readonly phase: number;
};

export function encodeSurveyState(valueBp: number, surveys: number, margin: number, phase: number): `0x${string}` {
  const biased = margin + 128;
  return `0x${valueBp.toString(16).padStart(4, '0')}${surveys.toString(16).padStart(2, '0')}${biased
    .toString(16)
    .padStart(2, '0')}${phase.toString(16).padStart(2, '0')}`;
}

export function decodeSurveyState(hex: string | undefined | null): SurveyGameState | null {
  if (!hex) return null;
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (body.length !== 10 || !/^[0-9a-fA-F]{10}$/.test(body)) return null;
  const phase = parseInt(body.slice(8, 10), 16);
  if (phase > PHASE_COMMITTED) return null;
  return {
    valueBp: parseInt(body.slice(0, 4), 16),
    surveys: parseInt(body.slice(4, 6), 16),
    margin: parseInt(body.slice(6, 8), 16) - 128,
    phase,
  };
}
