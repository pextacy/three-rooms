/**
 * THE BROKERS' own formatting: a price and a fee, both in basis points of the
 * stake. The token amounts are the same at every table and live in
 * `shared/ui/format.ts`.
 */
import { PRICE_DENOM } from '../../core/market';

export { formatAmount, parseAmount, formatWeight } from '../../../../shared/ui/format';

/** `10_200` -> "1.02×". */
export function formatPrice(priceBp: number): string {
  return `${(priceBp / PRICE_DENOM).toFixed(2)}×`;
}

/**
 * `325` -> "3.25%".
 *
 * Fees are shown as a percentage of the stake rather than as a multiple: they
 * are a cost, and a cost reads as a percentage. One decimal place is kept
 * because the cheapest man on the floor charges 0.95% and rounding him to 1%
 * would round away the reason he is asked first.
 */
export function formatFee(feeBp: number): string {
  const percent = (feeBp / PRICE_DENOM) * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, '')}%`;
}
