/**
 * May the room open the next round by itself?
 *
 * Free play deals continuously: a player who lands on the bare URL sees a lot
 * on the table in the first frame rather than a stake form, which is what
 * "zero clicks to comprehension" means (claude.md §5, and the D6 fresh-eyes
 * find in plan.md). Inside a host it must NOT: `openSession` stakes the
 * player's own money, and money is never moved except by something the player
 * did on purpose.
 *
 * This lived as the same four-line condition inlined in all three games, with
 * the reason written as a comment in two of them and dropped in the third. A
 * money-safety rule kept in triplicate and checked by nothing drifts — and the
 * way it drifts is silent, because deleting `kind === 'demo'` breaks no test,
 * throws nothing, and simply starts staking on load.
 *
 * So it has a name and a test now (`test/auto-deal.spec.ts`), which walks every
 * combination rather than the one the demo happens to take.
 */
import type { HostKind } from './host';

export type AutoDealView = {
  readonly kind: HostKind;
  /** Free play's chips. `null` when the host does not publish a purse. */
  readonly purseBase: bigint | null;
};

/**
 * @param view        the host's current snapshot
 * @param stakeBase   the stake the next round would open at
 * @param stakeError  whatever the stake control is already refusing, or null
 */
export function mayAutoDeal(
  view: AutoDealView | null,
  stakeBase: bigint,
  stakeError: string | null,
): boolean {
  if (view === null) return false;
  // The whole point. Real money is opened by the player, never by a render.
  if (view.kind !== 'demo') return false;
  if (stakeError !== null) return false;
  // A refused deal leaves the board empty with REFILL in reach, which is the
  // honest outcome of a purse that has run out.
  return view.purseBase === null || view.purseBase >= stakeBase;
}
