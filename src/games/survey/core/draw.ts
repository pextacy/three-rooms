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
import { draw, type Rehash, type Word } from '../../../shared/rng';

/**
 * One part per million. The manifest is drawn against 10,000 like CANDLE's
 * paytable, but a report's odds can run as fine as 2/731, so the belief draws
 * need a finer grid.
 */
export const DRAW_SPACE = 1_000_000;

/** A draw in [0, DRAW_SPACE), from a word, by rejection sampling. */
export function drawFine(word: Word, cursor: number, rehash: Rehash): { value: number; cursor: number; word: Word } {
  // Two 16-bit windows make a 32-bit value; reject above the largest multiple
  // of DRAW_SPACE that fits, so what survives is exactly uniform.
  const LIMIT = Math.floor(2 ** 32 / DRAW_SPACE) * DRAW_SPACE;
  let w = word;
  let c = cursor;
  for (;;) {
    const hi = draw16(w, c);
    const lo = draw16(hi.word, hi.cursor);
    const value = hi.value * 65_536 + lo.value;
    w = lo.word;
    c = lo.cursor;
    if (value < LIMIT) return { value: value % DRAW_SPACE, cursor: c, word: w };
    if (c >= 16) {
      w = rehash(w);
      c = 0;
    }
  }
}

/** A raw 16-bit window, with the same rehash discipline as `shared/rng.ts`. */
function draw16(word: Word, cursor: number): { value: number; cursor: number; word: Word } {
  if (cursor >= 16) throw new RangeError('cursor past the end of the word');
  const shift = BigInt(240 - cursor * 16);
  return { value: Number((word >> shift) & 0xffffn), cursor: cursor + 1, word };
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
