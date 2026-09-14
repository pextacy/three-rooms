/**
 * Formatting for base-unit amounts and multipliers. No game logic lives here.
 */
import { FACE_DENOM } from '../game/paytable';
import { WAX_DENOM } from '../game/wax';

/** Base units -> a human string, trimmed of trailing zeros. */
export function formatAmount(base: bigint, decimals: number, maxFraction = 2): string {
  const negative = base < 0n;
  const value = negative ? -base : base;
  const one = 10n ** BigInt(decimals);
  const whole = value / one;
  const scale = 10n ** BigInt(maxFraction);
  const frac = ((value % one) * scale) / one;

  const wholeText = whole.toLocaleString('en-US');
  const sign = negative ? '-' : '';
  if (frac === 0n) return `${sign}${wholeText}`;
  const fracText = frac.toString().padStart(maxFraction, '0').replace(/0+$/, '');
  return `${sign}${wholeText}.${fracText}`;
}

/** Whole tokens -> base units. Returns null on anything that is not a number. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') return null;
  const [whole = '0', fraction = ''] = trimmed.split('.');
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

/** `faceBp` -> "2.00×". */
export function formatFace(faceBp: number): string {
  return `${(faceBp / FACE_DENOM).toFixed(2)}×`;
}

/** `waxBp` -> "85%". */
export function formatWax(waxBp: number): string {
  return `${Math.round((waxBp / WAX_DENOM) * 100)}%`;
}

/** A probability out of 10,000 -> "5.50%". */
export function formatWeight(weight: number, denom: number): string {
  return `${((weight / denom) * 100).toFixed(2)}%`;
}
