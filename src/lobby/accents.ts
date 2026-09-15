/**
 * The List's three accents, derived from the three rooms.
 *
 * A room's money ink is chosen to be legible against that room — brass clears
 * 4.85:1 on soot at the last inch, smalt 5.10:1 on slate. Against PAPER all
 * three are far too pale, and none of them may simply be replaced: the accent's
 * whole job is to say *which room this is*, so it has to stay the same pigment.
 *
 * So each is walked down its own luminance until it clears the sheet, hue and
 * chroma untouched (`inkOnPaper`). That keeps the palette derived — change a
 * room's ink and the List follows it — and it means the contrast is a computed
 * fact rather than a designer's guess. `test/lobby-accents.spec.ts` checks all
 * three against the actual sheet colour.
 */
import { CANDLELIGHT, DAYLIGHT, LAMPLIGHT, LEVEL_FULL, css, inkOnPaper, paletteAtWax, type Room, type Rgb } from '../shared/render/light';

/**
 * The sheet, and the one place it is written down.
 *
 * It must match `--sheet` in `lobby.css`; if the two drift the accents are
 * computed against a colour that is not on the screen, so the test pins them
 * together rather than trusting a comment.
 */
export const SHEET: Rgb = { r: 216, g: 211, b: 199 };

/** Display type only ever needs 3:1, but these also set small caps and rules. */
export const ACCENT_RATIO = 4.5;

const ROOMS_BY_NAME: ReadonlyArray<readonly [string, Room]> = [
  ['candle', CANDLELIGHT],
  ['roads', DAYLIGHT],
  ['floor', LAMPLIGHT],
];

/** The accent for one room, as it must appear on paper. */
export function accentFor(room: Room): Rgb {
  return inkOnPaper(paletteAtWax(LEVEL_FULL, room).brass, SHEET, ACCENT_RATIO);
}

/** `[['--accent-candle', 'rgb(112 88 46)'], …]`, ready for the root. */
export function accents(): ReadonlyArray<readonly [string, string]> {
  return ROOMS_BY_NAME.map(([name, room]) => [`--accent-${name}`, css(accentFor(room))] as const);
}
