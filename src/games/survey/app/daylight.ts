/**
 * The light in THE SURVEY, and what it is a function of.
 *
 * CANDLE's claim is *brightness is the multiplier*: its wax ladder runs
 * 100 → 40% and the room is genuinely that much darker at the gutter. THE
 * SURVEY cannot make the same claim about its own money ladder, and it would be
 * dishonest to pretend otherwise: the premium falls only 1.5 points per
 * surveyor, and a 1.5% change in luminance is both invisible to a player and
 * inside the rounding error of an 8-bit channel. A claim a reviewer cannot
 * measure is a claim we do not make (claude.md §8).
 *
 * So the light here is a function of the same thing, counted the other way:
 *
 *   **The light is the day, and the day is how many surveyors you have sent.**
 *
 * A man rowed out to a hull in the roads, sounded her, and rowed back. You do
 * not get five of those in an afternoon. Every surveyor costs an hour of
 * daylight, the room walks down the same ladder CANDLE's wax does, and by the
 * fifth report you are reading the manifest by the same lamp the auctioneer next
 * door is bidding under — 40% of the light you started with.
 *
 * That IS measurable: `test/survey-scene.spec.ts` picks colours out of the
 * frame and checks the luminance against this table. The money cost is printed
 * as a number instead, beside it, where a number belongs.
 */
import { MAX_SURVEYS } from '../core/vessel';
import { LEVEL_DENOM, LEVEL_FLOOR, LEVEL_FULL } from '../../../shared/render/light';

/**
 * Light remaining after `k` surveyors, in basis points of full flame.
 *
 * Linear from full daylight to CANDLE's own gutter, so the two games end their
 * rounds in exactly the same room at exactly the same brightness.
 */
export const DAYLIGHT_BP: readonly number[] = Array.from(
  { length: MAX_SURVEYS + 1 },
  (_, k) => LEVEL_FULL - Math.round(((LEVEL_FULL - LEVEL_FLOOR) * k) / MAX_SURVEYS),
);

export const DAYLIGHT_DENOM = LEVEL_DENOM;

/** The light level after `k` surveyors. Clamped rather than thrown mid-frame. */
export function daylightAt(surveys: number): number {
  const k = surveys < 0 ? 0 : surveys > MAX_SURVEYS ? MAX_SURVEYS : Math.round(surveys);
  const level = DAYLIGHT_BP[k];
  if (level === undefined) throw new RangeError(`no daylight for ${surveys} surveys`);
  return level;
}

/** How much of the day is left, as a fraction. The audio follows this too. */
export function daylightFraction(surveys: number): number {
  return daylightAt(surveys) / DAYLIGHT_DENOM;
}

if (DAYLIGHT_BP.length !== MAX_SURVEYS + 1) {
  throw new Error(`the daylight ladder has ${DAYLIGHT_BP.length} rungs, expected ${MAX_SURVEYS + 1}`);
}
