/**
 * The five-inch discount ladder (docs.md §2.2, §9.2).
 *
 * Fifteen points of the prize per inch. Clean enough to do in your head, which
 * is the point: the player must be able to price patience without a calculator.
 */

/** Five pins, five inches, five lots. */
export const INCHES = 5;

/** Wax remaining at inch 1..5, in basis points of the face value. 100% = 10000. */
export const WAX_BP: readonly number[] = [10_000, 8_500, 7_000, 5_500, 4_000] as const;

/** The wax ladder's denominator. Distinct from `FACE_DENOM` (see `paytable.ts`). */
export const WAX_DENOM = 10_000;

/**
 * `faceBp` carries a denominator of 100 and `waxBp` one of 10,000, so a payout
 * divides by their product.
 *
 *   payout = stake * faceBp * waxBp / 1e6
 *
 * docs.md §3.3 printed `1e8` until the phase-0 spike; that made the 25x lot pay
 * 0.25x and reverted `openSession` on an underflow. See docs.md §7.3.
 */
export const PAYOUT_DENOM = 1_000_000n;

export function waxBpAt(inch: number): number {
  const wax = WAX_BP[inch - 1];
  if (wax === undefined) throw new RangeError(`inch ${inch} is outside 1..${INCHES}`);
  return wax;
}

/**
 * Payout in the token's base units. Integer division floors exactly once, at
 * the end — at most one base unit is given up per round, and that is documented
 * rather than hidden (docs.md §3.3).
 *
 * THE one payout rule. `quoteCaps`, `quoteRiskParams`, the settle path and the
 * forfeit quote all route through its Solidity twin, so a 25x win cannot
 * disagree with the reserve by a single base unit (claude.md I5).
 */
export function payoutBase(stakeBase: bigint, faceBp: number, inch: number): bigint {
  if (stakeBase < 0n) throw new RangeError('stake must not be negative');
  return (stakeBase * BigInt(faceBp) * BigInt(waxBpAt(inch))) / PAYOUT_DENOM;
}

if (WAX_BP.length !== INCHES) {
  throw new Error(`the wax ladder has ${WAX_BP.length} rungs, expected ${INCHES}`);
}
