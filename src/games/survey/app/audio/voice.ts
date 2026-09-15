/**
 * What THE SURVEY's sounds MEAN, separated from how they are made.
 *
 * The audio law (claude.md §5) asks for one thing above all: **sound must be
 * informative**. In CANDLE the pitch of the pin drop rises with the face value,
 * so an experienced player hears a good lot before they read it. Here the
 * equivalent is sharper, because the thing the player is buying is not a prize —
 * it is evidence:
 *
 *   **The bell is the belief.** A surveyor's report rings at a pitch set by the
 *   POSTERIOR the reports now add up to, not by what this one report said. Two
 *   reports that disagree ring the same note twice, because they leave the
 *   player exactly where they started — which is the whole mathematical claim of
 *   this game, made audible.
 *
 * The report's own direction is carried by timbre instead of pitch: SOUND is a
 * struck bell, ROT is a dull wooden knock. So a player hears WHAT was said and
 * WHERE IT LEAVES THEM as two separate facts, which is exactly how the maths
 * treats them.
 *
 * Same split as `render/light.ts`: the decision is checkable and tested, the
 * plumbing is not.
 */
import { MAX_SURVEYS, type Cargo } from '../../core/vessel';
import { daylightAt, daylightFraction } from '../daylight';
import { posteriorSound, isReachable } from '../../core/belief';
import {
  solve,
  bestCall,
  continuationValue,
  underwriteValue,
  declineValue,
  type Solution,
} from '../../core/solve';
import { compare, sub, toNumber, type Rational } from '../../../../shared/math/rational';
import { dwellFromTension, withTurbo } from '../../../../shared/audio/pacing';

export { DWELL_FAST_MS, DWELL_SLOW_MS, TURBO_SCALE } from '../../../../shared/audio/pacing';

/** The bell at the deepest belief in rot (margin -5, P(sound) = 0.27%). */
export const BELL_HZ_MIN = 174;
/** The bell at the deepest belief in soundness (margin +5, P(sound) = 99.4%). */
export const BELL_HZ_MAX = 1_046;

/**
 * The pitch a report rings at: the posterior, logarithmically.
 *
 * Pitch is perceived logarithmically, so the belief is mapped that way too —
 * which also spends the audible range where the game actually lives (the middle
 * margins) instead of on the two extremes nobody reaches twice.
 */
export function bellHz(margin: number): number {
  const p = toNumber(posteriorSound(margin));
  return BELL_HZ_MIN * (BELL_HZ_MAX / BELL_HZ_MIN) ** clamp01(p);
}

/**
 * The room bed follows the daylight, so the room quietens exactly as it darkens
 * — the two senses agree because they are reading the same ladder.
 */
export function roomGain(levelBp: number): number {
  return 0.035 * (levelBp / 10_000);
}

/** The murmur of a coffee house thins as the day goes. */
export function murmurDensityHz(levelBp: number): number {
  return 1.1 + 2.4 * (levelBp / 10_000);
}

// ---------------------------------------------------------------------------
//  Pacing
// ---------------------------------------------------------------------------

/**
 * How hard the decision at `(k, m)` actually is, 0 (obvious) to 1 (stuck).
 *
 * Two things can be close here, and either makes a state a decision:
 *
 *  - buying another report against calling it now — the Wald margin;
 *  - underwriting against declining — the value margin.
 *
 * The tension is whichever is closer, measured against the value of the best
 * call, so a cheap cargo and a rich one are judged on the same scale. All exact:
 * the gap is a rational and only the final ratio becomes a number.
 */
export function tension(cargo: Cargo, surveys: number, margin: number, solution: Solution = solved()): number {
  if (!isReachable(surveys, margin)) return 0;
  const forCargo = solution.byCargo.find(s => s.cargo.id === cargo.id);
  if (!forCargo) return 0;

  const call = bestCall(cargo, surveys, margin);
  const other = otherCall(cargo, surveys, margin);
  const gaps: Rational[] = [absOf(sub(call.value, other))];

  const survey = continuationValue(forCargo, surveys, margin);
  if (survey !== undefined) gaps.push(absOf(sub(survey, call.value)));

  const closest = gaps.reduce((best, gap) => (compare(gap, best) < 0 ? gap : best));
  const scale = toNumber(call.value);
  if (scale <= 0) return 0;

  // A fiftieth of the call's own value away is already an easy decision. The
  // number is not a taste: across all 126 reachable states the median gap is
  // 1.6% of the call value, so a fiftieth puts the median state at a brisk pace
  // and spends the slow end on the ones that really are close. The tightest —
  // the Coal at two reports for sound, where underwriting and sending one more
  // man differ by ONE PART IN TEN THOUSAND — gets the full hold.
  const reach = scale * 0.02;
  return clamp01(1 - toNumber(closest) / reach);
}

/** The call the DP did NOT pick, so the two can be compared. */
function otherCall(cargo: Cargo, surveys: number, margin: number): Rational {
  const chosen = bestCall(cargo, surveys, margin);
  const underwrite = underwriteValue(cargo, surveys, margin);
  const decline = declineValue(surveys);
  return chosen.call === 'UNDERWRITE' ? decline : underwrite;
}

/** How long to hold before the next report lands. */
export function dwellMs(cargo: Cargo, surveys: number, margin: number): number {
  return dwellFromTension(tension(cargo, surveys, margin));
}

export function dwellWithTurbo(cargo: Cargo, surveys: number, margin: number, turbo: boolean): number {
  return withTurbo(dwellMs(cargo, surveys, margin), turbo);
}

/**
 * The state in the whole game where the decision is closest to a coin toss —
 * the knife edge the design rests on. The `?` panel and the pacing tests both
 * read it from here rather than asserting "the Wine at two surveys" in prose.
 */
export function knifeEdge(
  solution: Solution = solved(),
): { readonly cargo: Cargo; readonly surveys: number; readonly margin: number; readonly tension: number } | null {
  let best: { cargo: Cargo; surveys: number; margin: number; tension: number } | null = null;

  for (const entry of solution.byCargo) {
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      for (let m = -k; m <= k; m += 2) {
        if (!isReachable(k, m)) continue;
        const t = tension(entry.cargo, k, m, solution);
        if (best === null || t > best.tension) best = { cargo: entry.cargo, surveys: k, margin: m, tension: t };
      }
    }
  }
  return best;
}

/** The light at a given number of surveys, so the audio never reaches into the game. */
export function levelAt(surveys: number): number {
  return daylightAt(surveys);
}

/** How much of the day is left, for anything that wants it as a fraction. */
export { daylightFraction };

// ---------------------------------------------------------------------------

/** The DP is exact rationals over six cargoes; solve it once per page. */
let cached: Solution | null = null;
function solved(): Solution {
  return (cached ??= solve());
}

function absOf(value: Rational): Rational {
  return value.n < 0n ? { n: -value.n, d: value.d } : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
