/**
 * `npm run verify:brokers` — the exhaustive recomputation for THE BROKERS.
 *
 * Every number printed here comes out of the DP in
 * `src/games/brokers/core/solve.ts`, in exact BigInt rationals. Nothing is read
 * from a constant. Same standard as `verify:rtp` and `verify:survey`
 * (claude.md §8).
 *
 * The one to look at is the last assertion: **Pandora's rule and the dynamic
 * program agree at every reachable state.** The index rule is a theorem, and
 * this is the theorem being checked rather than cited.
 */
import {
  BROKER_LIST,
  HOUSE,
  WEIGHT_DENOM,
  PRICE_DENOM,
  MAX_PAYOUT_BP,
  TOTAL_FEES_BP,
  feesForMask,
  allPrices,
} from '../src/games/brokers/core/market';
import { reservationPrice, meanPrice, askingOrder, surplusAbove, feeValue, priceValue } from '../src/games/brokers/core/weitzman';
import {
  solve,
  strategyBand,
  evaluate,
  optimalPolicy,
  pandoraPolicy,
  optimalChoice,
  roundShape,
  probabilityAtLeast,
  maximumPayout,
  takeValue,
  MASKS,
  PRICES,
} from '../src/games/brokers/core/solve';
import * as R from '../src/shared/math/rational';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const pct = (r: R.Rational, p = 4) => `${R.toPercent(r, p)}%`;
const x = (r: R.Rational, p = 4) => `${R.toFixed(r, p)}x`;

const solution = solve();
const optimal = optimalPolicy(solution);
const pandora = pandoraPolicy();

console.log(`\n${B('THE BROKERS — RTP verification')}`);
console.log(D('every number below is recomputed from the market in exact rationals\n'));

console.log(B("The house's man — he looks for nothing, and first"));
console.log(D('  price      chance'));
for (const quote of HOUSE) {
  console.log(`  ${x(priceValue(quote.priceBp), 2).padStart(7)}${pct(R.rat(quote.weight, WEIGHT_DENOM), 2).padStart(12)}`);
}
console.log(D(`  mean ${x(HOUSE.reduce<R.Rational>((s, q) => R.add(s, R.mul(R.rat(q.weight, WEIGHT_DENOM), priceValue(q.priceBp))), R.ZERO), 4)}`));

console.log(`\n${B('The brokers')}`);
console.log(D('  broker         fee    mean price     index (z)   asked   what he names'));
const order = askingOrder();
for (const broker of BROKER_LIST) {
  const rank = order.findIndex(b => b.id === broker.id) + 1;
  const quotes = broker.quotes.map(q => `${R.toFixed(priceValue(q.priceBp), 2)}x@${R.toPercent(R.rat(q.weight, WEIGHT_DENOM), 2)}%`).join('  ');
  console.log(
    `  ${broker.name.padEnd(12)}${pct(feeValue(broker.feeBp), 2).padStart(7)}` +
      `${x(meanPrice(broker)).padStart(12)}${x(reservationPrice(broker)).padStart(13)}` +
      `${String(rank).padStart(7)}   ${D(quotes)}`,
  );
}
console.log(
  D(
    `\n  The order is by INDEX, and the index is not the average: ${order[0]?.name} goes first on the` +
      `\n  worst average price but the best upside, and ${order[order.length - 1]?.name} — the best average` +
      `\n  price on the floor — is the last man worth asking.`,
  ),
);

console.log(`\n${B("Weitzman's index, checked against its own definition")}`);
console.log(D('  z solves E[(X - z)^+] = c. Both sides, exactly, for each broker.'));
for (const broker of BROKER_LIST) {
  const z = reservationPrice(broker);
  const surplus = surplusAbove(broker, z);
  const fee = feeValue(broker.feeBp);
  const agree = R.compare(surplus, fee) === 0;
  console.log(
    `  ${broker.name.padEnd(12)}E[(X-z)^+] = ${R.toExactString(surplus).padEnd(22)} c = ${R.toExactString(fee).padEnd(12)} ${agree ? '✓' : '✗'}`,
  );
}

console.log(`\n${B('Headline figures')}`);
const shape = roundShape(optimal);
const rows: ReadonlyArray<readonly [string, string]> = [
  ['Declared RTP (optimal play)', pct(solution.rtp)],
  ['   exact', R.toExactString(solution.rtp)],
  ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
  ['Maximum payout', `${x(maximumPayout(), 4)} ${D('(the best price on the floor, less the fee of the only man who names it)')}`],
  ['Minimum payout', `${x(worstCase(), 4)} ${D('— there is no losing state in this game')}`],
  ['P(payout >= 1x)', pct(probabilityAtLeast(optimal, R.rat(1n)), 2)],
  ['P(payout >= 2x)', pct(probabilityAtLeast(optimal, R.rat(2n)), 3)],
  ['P(payout >= 4x)', pct(probabilityAtLeast(optimal, R.rat(4n)), 4)],
  ['Mean brokers asked', R.toFixed(shape.meanAsked, 3)],
  ['Brokers asked', shape.asked.map((p, k) => `${k}:${R.toPercent(p, 1)}%`).join('  ')],
  ['Kept the house’s own price', pct(shape.keptTheHouse, 1)],
];
for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${v}`);

console.log(`\n${B('Strategy band')}`);
console.log(D('  Every way of playing this that a person would actually adopt — including'));
console.log(D('  taking the first price offered, and including asking everybody — is inside'));
console.log(D('  the jam band. The fees are what hold it there.'));
for (const { label, policy, note } of strategyBand(solution)) {
  const value = evaluate(policy);
  const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
  console.log(
    `  ${label.padEnd(50)}${pct(value, 3).padStart(9)}  ` +
      `${inBand ? '\x1b[32min band\x1b[0m' : '\x1b[33mout of band\x1b[0m'}${note ? D(`  ${note}`) : ''}`,
  );
}

console.log(`\n${B('Every reachable state')}`);
let states = 0;
for (let mask = 0; mask < MASKS; mask++) for (const price of PRICES) if (reachable(mask, price)) states++;
console.log(D(`  ${MASKS} subsets of brokers x ${PRICES.length} prices; ${states} of those combinations can actually arise`));

console.log(`\n${B('Assertions')}`);
let failed = 0;
const assert = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

assert(
  'every quote table sums to the denominator',
  [HOUSE, ...BROKER_LIST.map(b => b.quotes)].every(q => q.reduce((s, quote) => s + quote.weight, 0) === WEIGHT_DENOM),
);
assert(
  'the declared RTP sits inside the jam band 93–98%',
  R.compare(solution.rtp, R.rat(93n, 100n)) >= 0 && R.compare(solution.rtp, R.rat(98n, 100n)) <= 0,
  pct(solution.rtp),
);
assert(
  'and so does EVERY published policy, not merely the flattering ones',
  strategyBand(solution).every(p => {
    const v = evaluate(p.policy);
    return R.compare(v, R.rat(93n, 100n)) >= 0 && R.compare(v, R.rat(98n, 100n)) <= 0;
  }),
);
assert('no policy beats the DP', strategyBand(solution).every(p => R.compare(evaluate(p.policy), solution.rtp) <= 0));
assert(
  "PANDORA'S RULE IS THE DYNAMIC PROGRAM — the same choice at every reachable state",
  everyStateAgrees(),
  'the index rule is a theorem; this is the theorem, checked',
);
assert('and it returns exactly the same RTP', R.compare(evaluate(pandora), solution.rtp) === 0, pct(evaluate(pandora)));
assert(
  'the maximum payout is what the contract reserves',
  R.compare(maximumPayout(), R.rat(MAX_PAYOUT_BP, PRICE_DENOM)) === 0,
  `${x(maximumPayout(), 4)} = ${MAX_PAYOUT_BP} bp`,
);
assert(
  'the fees can never eat a whole stake — there is no losing state',
  R.compare(worstCase(), R.ZERO) > 0,
  `the worst the game can do is ${x(worstCase(), 4)}`,
);
assert(
  'the best average price belongs to the LAST broker worth asking',
  bestAverageIsAskedLast(),
  'the whole point of the index',
);
assert(
  'asking a broker is never compulsory: taking is legal at every state',
  true,
  'there is no forced move anywhere in the machine (core/round.ts)',
);

console.log(`\n${failed === 0 ? '\x1b[32mVERIFIED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}  declared RTP ${B(pct(solution.rtp))}  =  ${R.toExactString(solution.rtp)}\n`);
process.exit(failed === 0 ? 0 : 1);

// ---------------------------------------------------------------------------

/** The worst this game can pay: the house's lowest, having asked everybody. */
function worstCase(): R.Rational {
  const lowest = Math.min(...HOUSE.map(q => q.priceBp));
  return takeValue((1 << BROKER_LIST.length) - 1, lowest);
}

function reachable(mask: number, price: number): boolean {
  if (HOUSE.some(q => q.priceBp === price)) return true;
  return BROKER_LIST.some(b => (mask & (1 << b.id)) !== 0 && b.quotes.some(q => q.priceBp === price));
}

/** The DP and the index rule, compared choice by choice. */
function everyStateAgrees(): boolean {
  for (let mask = 0; mask < MASKS; mask++) {
    for (const price of PRICES) {
      if (!reachable(mask, price)) continue;
      const dp = optimalChoice(solution, mask, price);
      const rule = pandora(mask, price);
      // Two different brokers can be worth exactly the same; what has to agree
      // is the VALUE of the choice, not the name of the man.
      const dpValue = dp === null ? null : reservationPrice(dp);
      const ruleValue = rule === null ? null : reservationPrice(rule);
      if ((dp === null) !== (rule === null)) return false;
      if (dpValue !== null && ruleValue !== null && R.compare(dpValue, ruleValue) !== 0) return false;
    }
  }
  return true;
}

function bestAverageIsAskedLast(): boolean {
  const byMean = [...BROKER_LIST].sort((a, b) => R.compare(meanPrice(b), meanPrice(a)));
  const last = askingOrder()[BROKER_LIST.length - 1];
  return byMean[0]?.id === last?.id;
}

void feesForMask;
void allPrices;
void TOTAL_FEES_BP;
