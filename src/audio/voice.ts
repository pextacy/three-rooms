/**
 * What the sound MEANS, separated from how it is made (claude.md §5, audio law).
 *
 * "Sound must be informative: the pitch of the pin drop rises with the face value
 * of the lot being offered, so an experienced player hears a good lot before they
 * read it." That is a claim about a mapping, so the mapping lives here, pure and
 * tested, and `graphs.ts` only plays it.
 *
 * Same split as `render/light.ts`: the decision is checkable, the plumbing is not.
 */
import { FACE_DENOM, LOTS, MAX_FACE_BP } from '../game/paytable';
import { WAX_DENOM, INCHES, waxBpAt } from '../game/wax';
import { solve, faceValue } from '../game/solve';
import { compare, sub, toNumber, rat, type Rational } from '../game/rational';

/** The pin drop for an empty crate. Low, dull, unmistakable. */
export const PIN_HZ_MIN = 196;
/** The pin drop for the Sarah Christiana. */
export const PIN_HZ_MAX = 1568;

/**
 * Pin-drop pitch for a lot's face value.
 *
 * Logarithmic in the face value, because pitch is perceived logarithmically — a
 * linear ramp would bunch every interesting lot into the bottom of the range and
 * waste the top on the 25x nobody sees. Three octaves, spread across a paytable
 * that spans 0.50x to 25.00x.
 *
 * An empty crate gets the floor exactly, so "nothing on the table" has its own
 * unmistakable note rather than being the quiet end of a ramp.
 */
export function pinDropHz(faceBp: number): number {
  if (faceBp <= 0) return PIN_HZ_MIN;

  const lowest = LOTS.reduce((min, lot) => (lot.faceBp > 0 && lot.faceBp < min ? lot.faceBp : min), MAX_FACE_BP);
  const span = Math.log(MAX_FACE_BP / lowest);
  const position = span > 0 ? Math.log(Math.max(faceBp, lowest) / lowest) / span : 0;

  // The floor is reserved for the empty crate, so real lots start a step above it.
  const base = PIN_HZ_MIN * 1.25;
  return base * (PIN_HZ_MAX / base) ** clamp01(position);
}

/**
 * The room bed follows the flame. It is the same wax ladder the light uses, so
 * the room gets quieter as it gets darker and the two senses agree.
 */
export function roomGain(waxBp: number): number {
  return 0.035 * (waxBp / WAX_DENOM);
}

/** Wax crackle gets sparser as there is less wax to crackle. */
export function crackleDensityHz(waxBp: number): number {
  return 1.1 + 2.4 * (waxBp / WAX_DENOM);
}

// ---------------------------------------------------------------------------
//  Pacing (plan.md D4)
// ---------------------------------------------------------------------------

/**
 * "Hold longer on a lot that sits near the threshold, move fast through empty
 * crates. Derive the timing from the numbers, don't script it."
 *
 * So the dwell is a function of how close this lot's face value is to the claim
 * threshold at this inch — the DP's own threshold, not a hand-tuned table. A lot
 * that is genuinely a decision gets a beat; a lot that is not gets out of the way.
 */
export const DWELL_FAST_MS = 260;
export const DWELL_SLOW_MS = 1_150;

/** How close a lot is to being a real decision, 0 (obvious) to 1 (knife edge). */
export function tension(faceBp: number, inch: number): number {
  if (faceBp <= 0) return 0; // an empty crate is never a decision
  if (inch >= INCHES) return 0; // the gutter is forced; there is nothing to weigh

  const threshold = solve().threshold[inch];
  if (threshold === undefined) return 0;

  const face = rat(faceBp, FACE_DENOM);
  const distance = Math.abs(toNumber(sub(face, threshold)));
  // Half the threshold away is already an easy call; at the threshold itself the
  // player is genuinely stuck.
  const reach = Math.max(toNumber(threshold) * 0.5, 1e-9);
  return clamp01(1 - distance / reach);
}

/** How long to hold on this lot before the player is expected to act. */
export function dwellMs(faceBp: number, inch: number): number {
  return Math.round(DWELL_FAST_MS + (DWELL_SLOW_MS - DWELL_FAST_MS) * tension(faceBp, inch));
}

/** Turbo collapses every dwell without touching what the player must decide. */
export const TURBO_SCALE = 0.35;

export function dwellWithTurbo(faceBp: number, inch: number, turbo: boolean): number {
  const base = dwellMs(faceBp, inch);
  return turbo ? Math.round(base * TURBO_SCALE) : base;
}

/**
 * The lot that sits closest to a threshold anywhere in the game — the knife edge
 * the whole design is built on. Used by the `?` panel and by the pacing tests, so
 * neither has to hardcode "the 0.50x at the third inch".
 */
export function knifeEdge(): { readonly faceBp: number; readonly inch: number; readonly gap: Rational } | null {
  const solution = solve();
  let best: { faceBp: number; inch: number; gap: Rational } | null = null;

  for (let inch = 1; inch < INCHES; inch++) {
    const threshold = solution.threshold[inch];
    if (threshold === undefined) continue;
    for (const lot of LOTS) {
      if (lot.faceBp <= 0) continue;
      const gap = absRational(sub(faceValue(lot), threshold));
      if (best === null || compare(gap, best.gap) < 0) best = { faceBp: lot.faceBp, inch, gap };
    }
  }
  return best;
}

function absRational(value: Rational): Rational {
  return value.n < 0n ? rat(-value.n, value.d) : value;
}

/** Wax at an inch, re-exported so the audio layer never reaches into the game. */
export function waxAt(inch: number): number {
  return waxBpAt(inch);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
