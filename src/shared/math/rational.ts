/**
 * Exact rational arithmetic on BigInt. The DP never touches a float
 * (docs.md §2.3), because the whole pitch of this project is that the math is
 * checkable and a reviewer who recomputes it must get the same digits.
 *
 * Always normalised: `d > 0` and `gcd(|n|, d) === 1`, so equality is structural
 * and `compare` never has to cross-multiply a denominator it did not reduce.
 */
export type Rational = { readonly n: bigint; readonly d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let num = BigInt(n);
  let den = BigInt(d);
  if (den === 0n) throw new RangeError('rational with zero denominator');
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  if (g > 1n) {
    num /= g;
    den /= g;
  }
  return { n: num, d: den };
}

export const ZERO: Rational = rat(0n);

export function add(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RangeError('rational division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

/** -1 if a < b, 0 if equal, 1 if a > b. Exact — no float ever appears. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function max(a: Rational, b: Rational): Rational {
  return compare(a, b) >= 0 ? a : b;
}

/**
 * Decimal expansion to `places`, round-half-away-from-zero — the same rule a
 * reader applies by hand, so a judge checking a printed table against this
 * output never sees a spurious last-digit mismatch. The exact rational is
 * printed alongside anywhere the rounding could matter.
 */
export function toFixed(a: Rational, places: number): string {
  if (places < 0) throw new RangeError('places must not be negative');
  const negative = a.n < 0n;
  const n = negative ? -a.n : a.n;
  const scale = 10n ** BigInt(places);
  // Scale up, then round the remaining fraction: 2*rem >= d rounds away from zero.
  const scaled = (n * scale) / a.d;
  const remainder = (n * scale) % a.d;
  const rounded = 2n * remainder >= a.d ? scaled + 1n : scaled;
  const sign = negative ? '-' : '';
  if (places === 0) return `${sign}${rounded}`;
  const whole = rounded / scale;
  const frac = rounded % scale;
  return `${sign}${whole}.${frac.toString().padStart(places, '0')}`;
}

/** As a percentage string, e.g. "96.9961". */
export function toPercent(a: Rational, places = 4): string {
  return toFixed(mul(a, rat(100n)), places);
}

/** `n / d` in lowest terms, for printing the exact RTP. */
export function toExactString(a: Rational): string {
  return `${a.n} / ${a.d}`;
}

/** Lossy — for charts and tolerance comparisons only, never for a declared number. */
export function toNumber(a: Rational): number {
  return Number(a.n) / Number(a.d);
}
