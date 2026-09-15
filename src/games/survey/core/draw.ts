/**
 * Where the randomness enters THE SURVEY — and the reason it enters in the
 * order it does.
 *
 * **The ship's condition cannot be decided first.** Every hook on the contract
 * is `view`, so the only state is `gameState`, which the facet emits on every
 * step and the player echoes back. Anything written there is public. If the
 * truth were drawn at the start and stored, the player would simply read it;
 * if it were derived from the opening VRF word, the player would read that
 * instead — the facet emits every word it receives.
 *
 * So the generative order is **reversed**. Reports are drawn from the
 * PREDICTIVE distribution, which depends only on the margin so far and is
 * therefore safe to compute in public; the ship's condition is drawn at
 * SETTLEMENT from the POSTERIOR given the final margin. The joint distribution
 * over (reports, truth) is identical either way — it is the same probability
 * model factored the other direction — but the truth now comes from a word that
 * does not exist until the player has already committed.
 *
 * Draws are uniform on [0, DRAW_SPACE) and thresholds are compared by
 * cross-multiplication, so no probability is ever rounded into a constant. The
 * only discretisation is the draw space itself, and `test/survey-rng.spec.ts`
 * bounds what that costs.
 */
import { posteriorSound, predictiveSound } from './belief';
import { cargoForDraw, WEIGHT_DENOM, type Cargo, type Report } from './vessel';
import { draw, MAX_REHASHES, WINDOWS, type Rehash, type Word } from '../../../shared/rng';

/**
 * One part per million. The manifest is drawn against 10,000 like CANDLE's
 * paytable, but a report's odds can run as fine as 2/731, so the belief draws
 * need a finer grid.
 */
export const DRAW_SPACE = 1_000_000;

/**
 * The rehash cap and the window count are CANDLE's, imported rather than
 * restated: both games draw from the same 256-bit word in the same 16-bit
 * windows, and both contracts carry the same bound because an unbounded loop in
 * a settlement path cannot have its gas reasoned about (claude.md §3).
 * `test/survey-draw.spec.ts` pins the number to the Solidity.
 */

/** The largest multiple of DRAW_SPACE that fits in 32 bits. */
export const FINE_LIMIT = Math.floor(2 ** 32 / DRAW_SPACE) * DRAW_SPACE;

type Cursor = { word: Word; cursor: number; rehashes: number };

/**
 * One 16-bit window, rehashing the word when the cursor runs off the end.
 *
 * This mirrors `_window` in `Survey.sol` step for step — including the rehash,
 * which an earlier version of this file left out. It THREW at the end of a word
 * instead, so a fine draw that began on the last window could not complete: the
 * contract would have carried on and the client would have raised, which is
 * exactly the kind of parity gap that only ever appears in production.
 */
function window16(c: Cursor, rehash: Rehash): number {
  for (let pass = 0; pass <= MAX_REHASHES; pass++) {
    if (c.cursor < WINDOWS) {
      const shift = BigInt(240 - c.cursor * 16);
      c.cursor += 1;
      return Number((c.word >> shift) & 0xffffn);
    }
    c.word = rehash(c.word);
    c.cursor = 0;
    c.rehashes += 1;
  }
  throw new Error(`randomness exhausted after ${MAX_REHASHES} rehashes`);
}

/**
 * A draw in [0, DRAW_SPACE), from a word, by rejection sampling.
 *
 * Two 16-bit windows make a 32-bit value; anything at or above the largest
 * multiple of DRAW_SPACE that fits is rejected, so what survives is exactly
 * uniform. `word % n` is biased and is not used anywhere.
 */
export function drawFine(word: Word, cursor: number, rehash: Rehash): { value: number; cursor: number; word: Word } {
  if (!Number.isInteger(cursor) || cursor < 0) throw new RangeError('cursor must be a non-negative integer');
  const c: Cursor = { word, cursor, rehashes: 0 };

  // Bounded, like the contract's: 64 tries is (5536/65536)^64 ~ 4e-69 away from
  // being reached, and it reverts loudly rather than spinning.
  for (let tries = 0; tries < 64; tries++) {
    const value = window16(c, rehash) * 65_536 + window16(c, rehash);
    if (value < FINE_LIMIT) return { value: value % DRAW_SPACE, cursor: c.cursor, word: c.word };
  }
  throw new Error('randomness exhausted: 64 rejected windows');
}

/** The manifest draw: which cargo the voyage carries. Mirrors CANDLE's shape. */
export function drawCargo(word: Word, cursor: number, rehash: Rehash): { cargo: Cargo; cursor: number; word: Word } {
  const result = draw(word, cursor, rehash);
  return { cargo: cargoForDraw(result.value % WEIGHT_DENOM), cursor: result.cursor, word: result.word };
}

/**
 * What the next surveyor comes back saying, given what the others said.
 *
 * Drawn from the PREDICTIVE distribution, so nothing about the ship's condition
 * has to exist yet. Exact: the threshold is compared by cross-multiplication
 * rather than rounded into a constant.
 */
export function drawReport(
  margin: number,
  word: Word,
  cursor: number,
  rehash: Rehash,
): { report: Report; cursor: number; word: Word } {
  const p = predictiveSound(margin);
  const result = drawFine(word, cursor, rehash);
  // value/DRAW_SPACE < n/d  <=>  value * d < n * DRAW_SPACE
  const sound = BigInt(result.value) * p.d < p.n * BigInt(DRAW_SPACE);
  return { report: sound ? 'SOUND' : 'ROTTEN', cursor: result.cursor, word: result.word };
}

/**
 * Whether she was sound all along, drawn at SETTLEMENT from the posterior.
 *
 * This is the word the player cannot see coming: it is requested only after the
 * call is locked in, so the decision is always made against a belief and never
 * against an answer.
 */
export function drawCondition(
  margin: number,
  word: Word,
  cursor: number,
  rehash: Rehash,
): { isSound: boolean; cursor: number; word: Word } {
  const p = posteriorSound(margin);
  const result = drawFine(word, cursor, rehash);
  return { isSound: BigInt(result.value) * p.d < p.n * BigInt(DRAW_SPACE), cursor: result.cursor, word: result.word };
}
