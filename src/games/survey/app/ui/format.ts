/**
 * THE SURVEY's own formatting: a cargo's value and a premium level. The token
 * amounts are the same at either table and live in `shared/ui/format.ts`.
 */
import { VALUE_DENOM, PREMIUM_DENOM } from '../../core/vessel';

export { formatAmount, parseAmount, formatWeight } from '../../../../shared/ui/format';

/** `valueBp` -> "2.50×". */
export function formatValue(valueBp: number): string {
  return `${(valueBp / VALUE_DENOM).toFixed(2)}×`;
}

/**
 * `premiumBp` -> "98.5%".
 *
 * One decimal, kept only when it is not zero: the ladder falls in half points,
 * so rounding to whole percents would print two different rungs as the same
 * number and quietly make the cost of a surveyor look like nothing.
 */
export function formatPremium(premiumBp: number): string {
  const percent = (premiumBp / PREMIUM_DENOM) * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}
