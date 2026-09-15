/**
 * CANDLE's own formatting: a face value and a wax level. The token amounts are
 * the same at either table and live in `shared/ui/format.ts`.
 */
import { FACE_DENOM } from '../../core/paytable';
import { WAX_DENOM } from '../../core/wax';

export { formatAmount, parseAmount, formatWeight } from '../../../../shared/ui/format';

/** `faceBp` -> "2.00×". */
export function formatFace(faceBp: number): string {
  return `${(faceBp / FACE_DENOM).toFixed(2)}×`;
}

/** `waxBp` -> "85%". */
export function formatWax(waxBp: number): string {
  return `${Math.round((waxBp / WAX_DENOM) * 100)}%`;
}

