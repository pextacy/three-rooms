/**
 * How long the house waits before it shows you the next thing (plan.md D4).
 *
 * "Hold longer on a decision that sits near the threshold, move fast through the
 * ones that are not decisions. Derive the timing from the numbers, don't script
 * it." That rule is the same at both tables, so the constants live here and each
 * game supplies only its own measure of tension — CANDLE from the distance
 * between a lot's face and the claim threshold, THE SURVEY from the gap between
 * buying another report and calling it now.
 *
 * Nothing is hidden by the wait: the player cannot act until the thing is on the
 * table either way, so the pacing costs them no decision.
 */

/** A decision that is not one. */
export const DWELL_FAST_MS = 260;
/** A knife edge. */
export const DWELL_SLOW_MS = 1_150;

/** Turbo collapses every dwell without touching what the player must decide. */
export const TURBO_SCALE = 0.35;

/** `tension` is 0 (obvious) to 1 (genuinely stuck). */
export function dwellFromTension(tension: number): number {
  const t = tension < 0 ? 0 : tension > 1 ? 1 : tension;
  return Math.round(DWELL_FAST_MS + (DWELL_SLOW_MS - DWELL_FAST_MS) * t);
}

export function withTurbo(ms: number, turbo: boolean): number {
  return turbo ? Math.round(ms * TURBO_SCALE) : ms;
}
