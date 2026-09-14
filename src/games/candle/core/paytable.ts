/**
 * THE single source of truth for face values and weights (docs.md §2.1, §9.1).
 *
 * Change a number here, run `npm run gen:constants` to regenerate the Solidity
 * mirror, and let the tests tell you what broke. Never hand-edit
 * `contracts/generated/Paytable.sol`.
 *
 * Pure. No React, no DOM, no `window`, no `Date.now()`, no ambient randomness.
 */

import { draw } from '../../../shared/rng';

/** Weights are out of this. Asserted below and in CI. */
export const WEIGHT_DENOM = 10_000;

/**
 * Face value is the multiplier x100 — `100 bp = 1.00x` — so the 25x lot is
 * `2500`. This is NOT the same denominator as the wax ladder's 10,000; the two
 * meet in `PAYOUT_DENOM` (see `wax.ts`). Getting this wrong makes the top lot
 * pay 0.25x, which is exactly what happened before the phase-0 spike caught it.
 */
export const FACE_DENOM = 100;

export type LotId = 0 | 1 | 2 | 3 | 4 | 5;

export type Lot = {
  readonly id: LotId;
  readonly faceBp: number;
  readonly weight: number;
  /** The auctioneer's name for it. Period-plausible, never twee. */
  readonly name: string;
};

export const LOTS: readonly Lot[] = [
  { id: 0, faceBp: 0, weight: 6690, name: 'Empty crate' },
  { id: 1, faceBp: 50, weight: 1000, name: "Ship's stores" },
  { id: 2, faceBp: 100, weight: 1600, name: 'Cordage' },
  { id: 3, faceBp: 200, weight: 550, name: 'Sailcloth' },
  { id: 4, faceBp: 500, weight: 140, name: 'Ordnance' },
  { id: 5, faceBp: 2500, weight: 20, name: 'The Sarah Christiana' },
] as const;

/**
 * Cumulative weights, so a uniform draw `r` in [0, WEIGHT_DENOM) maps to the
 * first lot whose cumulative weight exceeds it. The contract mirrors this table
 * exactly (docs.md §2.4).
 *
 *   r <  6690 -> 0.00x   r < 7690 -> 0.50x   r < 9290 -> 1.00x
 *   r <  9840 -> 2.00x   r < 9980 -> 5.00x   else     -> 25.00x
 */
export const CUMULATIVE_WEIGHTS: readonly number[] = LOTS.reduce<number[]>((acc, lot) => {
  acc.push((acc[acc.length - 1] ?? 0) + lot.weight);
  return acc;
}, []);

/** The largest face value the paytable can produce. Drives `quoteCaps`. */
export const MAX_FACE_BP = LOTS.reduce((max, lot) => (lot.faceBp > max ? lot.faceBp : max), 0);

/** The top tier's probability, for `quoteRiskParams`. Marginal, not "any win". */
export const TOP_TIER_WEIGHT = LOTS[LOTS.length - 1]?.weight ?? 0;

/** Maps a uniform draw in [0, WEIGHT_DENOM) to a lot. Mirrors `Candle.sol`. */
export function lotForDraw(r: number): Lot {
  if (!Number.isInteger(r) || r < 0 || r >= WEIGHT_DENOM) {
    throw new RangeError(`draw out of range: ${r} (expected an integer in [0, ${WEIGHT_DENOM}))`);
  }
  for (let i = 0; i < LOTS.length; i++) {
    const cumulative = CUMULATIVE_WEIGHTS[i];
    const lot = LOTS[i];
    if (cumulative === undefined || lot === undefined) break;
    if (r < cumulative) return lot;
  }
  // Unreachable: the final cumulative weight is WEIGHT_DENOM and r < WEIGHT_DENOM.
  throw new Error(`no lot for draw ${r} — the weights do not sum to ${WEIGHT_DENOM}`);
}

/** A word -> a lot, through the shared rejection sampler. */
export function drawLot(
  word: bigint,
  cursor = 0,
  rehash: (w: bigint) => bigint = () => {
    throw new Error('rehash required');
  },
): { readonly lot: Lot; readonly value: number; readonly cursor: number; readonly word: bigint; readonly rejected: number } {
  const result = draw(word, cursor, rehash);
  return { ...result, lot: lotForDraw(result.value) };
}

export function lotById(id: LotId): Lot {
  const lot = LOTS[id];
  if (lot === undefined) throw new RangeError(`no lot with id ${id}`);
  return lot;
}

// The whole design rests on these summing exactly. Assert at module load so a
// bad edit fails on import rather than three layers deep in the DP.
const weightSum = LOTS.reduce((sum, lot) => sum + lot.weight, 0);
if (weightSum !== WEIGHT_DENOM) {
  throw new Error(`paytable weights sum to ${weightSum}, expected ${WEIGHT_DENOM}`);
}
