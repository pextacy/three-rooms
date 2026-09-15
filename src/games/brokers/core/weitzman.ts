/**
 * Weitzman's index, exactly (THE BROKERS).
 *
 * The reservation price `z` of a broker is the price in hand at which you would
 * be exactly indifferent to paying his fee for a look:
 *
 *     E[ (X - z)^+ ] = c
 *
 * — the expected amount by which his price would beat `z`, set equal to his fee.
 * Above `z` he cannot pay for himself; below it he can.
 *
 * **Pandora's rule (Weitzman 1979).** Ask the unasked broker with the highest
 * `z`; stop the moment the price you are holding is at least the highest `z`
 * left. That policy is optimal — not a heuristic — and `test/brokers-rtp.spec.ts`
 * checks it against the dynamic program at every reachable state rather than
 * taking the theorem's word for it.
 *
 * The index is solved in CLOSED FORM here, not by bisection. The left-hand side
 * is piecewise linear and decreasing in `z`, so the segment containing the
 * answer is found by walking the prices downward, and on that segment
 *
 *     z = ( Σ_{p_j > z} w_j p_j - c ) / Σ_{p_j > z} w_j
 *
 * which is an exact rational. No float is involved anywhere in this file.
 */
import { BROKER_LIST, WEIGHT_DENOM, PRICE_DENOM, type Broker } from './market';
import { rat, add, sub, mul, div, compare, type Rational } from '../../../shared/math/rational';

/** A price, as a multiple of the stake. */
export function priceValue(priceBp: number): Rational {
  return rat(priceBp, PRICE_DENOM);
}

/** A fee, as a multiple of the stake. */
export function feeValue(feeBp: number): Rational {
  return rat(feeBp, PRICE_DENOM);
}

/**
 * `E[(X - z)^+]` for a broker, in stake multiples. Exact.
 *
 * The surplus a look is worth when you are already holding `z`.
 */
export function surplusAbove(broker: Broker, z: Rational): Rational {
  let total = rat(0n);
  for (const quote of broker.quotes) {
    const price = priceValue(quote.priceBp);
    if (compare(price, z) <= 0) continue;
    total = add(total, mul(rat(quote.weight, WEIGHT_DENOM), sub(price, z)));
  }
  return total;
}

/**
 * The reservation price, exactly.
 *
 * Walks the prices from the top: on the segment where exactly the top `k` prices
 * beat `z`, the equation is linear and inverts in one step. The answer is the
 * first candidate that actually lands inside its own segment.
 */
export function reservationPrice(broker: Broker): Rational {
  const fee = feeValue(broker.feeBp);
  const descending = [...broker.quotes].sort((a, b) => b.priceBp - a.priceBp);

  let weight = rat(0n);
  let weighted = rat(0n);

  for (const [i, quote] of descending.entries()) {
    weight = add(weight, rat(quote.weight, WEIGHT_DENOM));
    weighted = add(weighted, mul(rat(quote.weight, WEIGHT_DENOM), priceValue(quote.priceBp)));

    // z = (Σ w p - c) / Σ w, on the segment where exactly these prices beat z.
    const z = div(sub(weighted, fee), weight);
    const below = priceValue(quote.priceBp);
    const above = descending[i + 1];

    const insideTop = compare(z, below) <= 0;
    const insideBottom = above === undefined || compare(z, priceValue(above.priceBp)) >= 0;
    if (insideTop && insideBottom) return z;
  }

  /**
   * Unreachable for any manifest that charges less than the whole expected
   * price: the surplus at z = 0 is the broker's mean, so a fee below it always
   * has a crossing. A fee above it would mean a broker nobody could ever want,
   * which `market.ts` would be wrong to carry.
   */
  throw new Error(`${broker.name}'s fee exceeds everything he could ever name`);
}

/** Every broker's index, by id. */
export function indices(): readonly Rational[] {
  return BROKER_LIST.map(reservationPrice);
}

/** The brokers in the order Pandora's rule asks them: highest index first. */
export function askingOrder(): readonly Broker[] {
  const z = indices();
  return [...BROKER_LIST].sort((a, b) => compare(z[b.id] as Rational, z[a.id] as Rational));
}

/**
 * Pandora's rule at one state: which broker to ask, or null to take what you
 * are holding.
 *
 * `mask` is the set of brokers already asked; `best` is the best price in hand
 * as a stake multiple.
 */
export function pandoraChoice(mask: number, best: Rational): Broker | null {
  const z = indices();
  let pick: Broker | null = null;
  let top: Rational | null = null;

  for (const broker of BROKER_LIST) {
    if (mask & (1 << broker.id)) continue;
    const index = z[broker.id] as Rational;
    if (top === null || compare(index, top) > 0) {
      top = index;
      pick = broker;
    }
  }

  if (pick === null || top === null) return null;
  // Stop the moment what you hold is at least the best index left.
  return compare(best, top) >= 0 ? null : pick;
}

/** The mean price a broker names. Published beside his index, because the two disagree. */
export function meanPrice(broker: Broker): Rational {
  return broker.quotes.reduce<Rational>(
    (sum, quote) => add(sum, mul(rat(quote.weight, WEIGHT_DENOM), priceValue(quote.priceBp))),
    rat(0n),
  );
}
