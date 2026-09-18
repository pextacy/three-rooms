/**
 * What the surveys add up to (THE SURVEY).
 *
 * The state of a survey is not the list of reports — it is their **margin**:
 * how many said SOUND minus how many said ROTTEN. Two reports that disagree
 * cancel exactly, because each carries the same weight of evidence. That is not
 * a simplification for convenience; it falls out of Bayes, and it is why the UI
 * can honestly print "the surveys stand two to one for rot" and be telling you
 * the whole truth about your position.
 *
 * With a prior of `a/b` on sound and a surveyor accurate `q` of the time, the
 * posterior odds after a margin of `m` are
 *
 *     odds(sound) = (a / (b - a)) * r^m,      r = q / (1 - q)
 *
 * so the posterior depends on `m` alone. Exact rationals throughout.
 */
import { PRIOR_SOUND_NUM, PRIOR_SOUND_DEN, ACCURACY_NUM, ACCURACY_DEN } from './vessel';
import { rat, add, sub, mul, div, compare, type Rational } from '../../../shared/math/rational';

/** `q`, the chance a surveyor's report matches the truth. */
export function accuracy(): Rational {
  return rat(ACCURACY_NUM, ACCURACY_DEN);
}

/** `r = q / (1 - q)`, the evidence weight of a single report. */
export function evidenceRatio(): Rational {
  const q = accuracy();
  return div(q, sub(rat(1n), q));
}

/** The prior on the ship being sound, before any surveyor goes aboard. */
export function prior(): Rational {
  return rat(PRIOR_SOUND_NUM, PRIOR_SOUND_DEN);
}

/** `r^m`, for a margin that may be negative. */
function ratioPow(m: number): Rational {
  const r = evidenceRatio();
  let out = rat(1n);
  const times = Math.abs(m);
  for (let i = 0; i < times; i++) out = mul(out, r);
  return m >= 0 ? out : div(rat(1n), out);
}

/**
 * P(the ship is sound | a margin of `m` reports for sound).
 *
 * `m` is signed: +2 means two more SOUND reports than ROTTEN.
 */
export function posteriorSound(margin: number): Rational {
  const p = prior();
  const priorOdds = div(p, sub(rat(1n), p));
  const odds = mul(priorOdds, ratioPow(margin));
  // P = odds / (1 + odds)
  return div(odds, add(rat(1n), odds));
}

/** P(the next surveyor comes back saying SOUND), from where the player stands. */
export function predictiveSound(margin: number): Rational {
  const q = accuracy();
  const pSound = posteriorSound(margin);
  // sound ship reports SOUND with q; rotten ship reports SOUND with 1 - q
  return add(mul(pSound, q), mul(sub(rat(1n), pSound), sub(rat(1n), q)));
}

/** How often the better of the two calls is the right one, at this margin. */
export function bestCallConfidence(margin: number): Rational {
  const p = posteriorSound(margin);
  const q = sub(rat(1n), p);
  return compare(p, q) >= 0 ? p : q;
}

/** A margin is reachable after `k` surveys only if it has `k`'s parity and |m| <= k. */
export function isReachable(surveys: number, margin: number): boolean {
  return Math.abs(margin) <= surveys && (surveys - margin) % 2 === 0;
}
