/**
 * What THE BROKERS' sounds MEAN, separated from how they are made.
 *
 * The audio law asks that sound be informative (claude.md §5). CANDLE's pin drop
 * rises with the face value; THE SURVEY's bell is the belief. Here the thing a
 * player needs to hear is not the price on its own — it is **whether it beat
 * what you were already holding**, because a price below your best changes
 * nothing at all.
 *
 *   **The pitch is the price**, logarithmically, across the whole floor.
 *   **The interval is the news.** A price that beats your best resolves UPWARD
 *   into a second note; a price that does not falls away from it. You hear
 *   whether the fee bought you anything before you have read a number.
 *
 * Same split as `render/light.ts`: the decision is checkable and tested, the
 * plumbing is not.
 */
import { BROKER_LIST, HOUSE, PRICE_DENOM, type Broker } from '../../core/market';
import { reservationPrice, meanPrice } from '../../core/weitzman';
import { solve, optimalPolicy, askValue, takeValue, type Solution } from '../../core/solve';
import { compare, sub, toNumber, type Rational } from '../../../../shared/math/rational';
import { dwellFromTension, withTurbo } from '../../../../shared/audio/pacing';

export { DWELL_FAST_MS, DWELL_SLOW_MS, TURBO_SCALE } from '../../../../shared/audio/pacing';

/** The lowest price anybody on this floor names. */
export const FLOOR_HZ = 165;
/** The highest. */
export const CEILING_HZ = 1_320;

/** Every price the market can produce, for the ends of the scale. */
const LOWEST = Math.min(...HOUSE.map(q => q.priceBp), ...BROKER_LIST.flatMap(b => b.quotes.map(q => q.priceBp)));
const HIGHEST = Math.max(...HOUSE.map(q => q.priceBp), ...BROKER_LIST.flatMap(b => b.quotes.map(q => q.priceBp)));

/**
 * The pitch a named price is spoken at.
 *
 * Logarithmic in the price, because pitch is heard logarithmically — and the
 * floor spans 0.35x to 5.00x, so a linear ramp would bunch every ordinary price
 * into the bottom of the range and spend the top on the one price in four
 * hundred nobody hears twice.
 */
export function priceHz(priceBp: number): number {
  const span = Math.log(HIGHEST / LOWEST);
  const position = span > 0 ? Math.log(Math.max(priceBp, LOWEST) / LOWEST) / span : 0;
  return FLOOR_HZ * (CEILING_HZ / FLOOR_HZ) ** clamp01(position);
}

/** True when this price is worth having: it beats what is already in hand. */
export function beatsTheBest(priceBp: number, bestBp: number): boolean {
  return priceBp > bestBp;
}

/** The room bed follows what the day has cost, so it thins as the fees mount. */
export function roomGain(levelBp: number): number {
  return 0.035 * (levelBp / 10_000);
}

export function murmurDensityHz(levelBp: number): number {
  return 1.1 + 2.4 * (levelBp / 10_000);
}

// ---------------------------------------------------------------------------
//  Pacing
// ---------------------------------------------------------------------------

/**
 * How hard the decision at this state actually is, 0 (obvious) to 1 (stuck).
 *
 * The gap between the best thing you could do and the second best, measured
 * against what you are holding. When asking somebody is clearly right — or
 * clearly a waste — the room moves on; when the two are within a whisker, it
 * holds. Exact: the gap is a rational and only the final ratio becomes a number.
 */
export function tension(mask: number, bestBp: number, solution: Solution = solved()): number {
  const options: Rational[] = [takeValue(mask, bestBp)];
  for (const broker of BROKER_LIST) {
    if (mask & (1 << broker.id)) continue;
    options.push(askValue(solution, mask, bestBp, broker));
  }
  if (options.length < 2) return 0;

  options.sort((a, b) => compare(b, a));
  const best = options[0] as Rational;
  const second = options[1] as Rational;
  const scale = toNumber(best);
  if (scale <= 0) return 0;

  // A fiftieth of the round's own worth away is already an easy call — the same
  // reach THE SURVEY uses, and for the same reason: it puts the median state at
  // a brisk pace and spends the slow end on the ones that are genuinely close.
  const reach = scale * 0.02;
  return clamp01(1 - toNumber(sub(best, second)) / reach);
}

export function dwellMs(mask: number, bestBp: number): number {
  return dwellFromTension(tension(mask, bestBp));
}

export function dwellWithTurbo(mask: number, bestBp: number, turbo: boolean): number {
  return withTurbo(dwellMs(mask, bestBp), turbo);
}

/**
 * The state where the decision is closest to a coin toss. The `?` panel and the
 * pacing tests read it from here rather than asserting a state in prose.
 */
export function knifeEdge(
  solution: Solution = solved(),
): { readonly mask: number; readonly bestBp: number; readonly tension: number } | null {
  let best: { mask: number; bestBp: number; tension: number } | null = null;
  for (let mask = 0; mask < 1 << BROKER_LIST.length; mask++) {
    for (const price of prices()) {
      if (!reachable(mask, price)) continue;
      const t = tension(mask, price, solution);
      if (best === null || t > best.tension) best = { mask, bestBp: price, tension: t };
    }
  }
  return best;
}

/** What the optimal player would do here — for the pacing, never for the UI. */
export function optimalAt(mask: number, bestBp: number): Broker | null {
  return optimalPolicy(solved())(mask, bestBp);
}

/** A broker's index and mean, for anything that wants to print both. */
export function indexAndMean(broker: Broker): { readonly index: Rational; readonly mean: Rational } {
  return { index: reservationPrice(broker), mean: meanPrice(broker) };
}

// ---------------------------------------------------------------------------

let cached: Solution | null = null;
function solved(): Solution {
  return (cached ??= solve());
}

function prices(): readonly number[] {
  const set = new Set<number>(HOUSE.map(q => q.priceBp));
  for (const broker of BROKER_LIST) for (const quote of broker.quotes) set.add(quote.priceBp);
  return [...set].sort((a, b) => a - b);
}

function reachable(mask: number, price: number): boolean {
  if (HOUSE.some(q => q.priceBp === price)) return true;
  return BROKER_LIST.some(b => (mask & (1 << b.id)) !== 0 && b.quotes.some(q => q.priceBp === price));
}

/** A price as a multiple of the stake, for anything that needs the number. */
export function asMultiple(priceBp: number): number {
  return priceBp / PRICE_DENOM;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
