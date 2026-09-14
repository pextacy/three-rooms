/**
 * `npm run verify:rtp` — the exhaustive recomputation (docs.md §7).
 *
 * Every number this prints is recomputed from `src/game/paytable.ts` by the DP
 * in `src/game/solve.ts`, in exact BigInt rationals. Nothing is read from a
 * constant. This is the command a reviewer runs to check the claim, and it is
 * where the README and the `?` panel get their numbers (claude.md §8).
 */
import { LOTS, WEIGHT_DENOM, FACE_DENOM, CUMULATIVE_WEIGHTS, MAX_FACE_BP } from '../src/games/candle/core/paytable';
import { INCHES, payoutBase, waxBpAt } from '../src/games/candle/core/wax';
import {
  solve,
  optimalPolicy,
  strategyBand,
  evaluate,
  outcomes,
  reachByInch,
  probabilityAtLeast,
  probabilityOfNothing,
  meanRoundLength,
  standardDeviation,
  faceValue,
  lotProbability,
  waxFraction,
} from '../src/games/candle/core/solve';
import * as R from '../src/shared/math/rational';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const pct = (r: R.Rational, p = 4) => `${R.toPercent(r, p)}%`;

const solution = solve();
const optimal = optimalPolicy(solution);
const at = (list: readonly (R.Rational | undefined)[], i: number): R.Rational => {
  const v = list[i];
  if (v === undefined) throw new Error(`missing value at index ${i}`);
  return v;
};

console.log(`\n${B('CANDLE — RTP verification')}`);
console.log(D('every number below is recomputed from the paytable in exact rationals\n'));

// ---------------------------------------------------------------- paytable
console.log(B('Paytable'));
console.log(D('  lot                      face       weight     probability'));
for (const lot of LOTS) {
  console.log(
    `  ${lot.name.padEnd(23)}${(lot.faceBp / FACE_DENOM).toFixed(2).padStart(6)}x` +
      `${String(lot.weight).padStart(12)}${pct(lotProbability(lot), 2).padStart(16)}`,
  );
}
const weightSum = LOTS.reduce((s, l) => s + l.weight, 0);
console.log(D(`  weights sum to ${weightSum} / ${WEIGHT_DENOM}${weightSum === WEIGHT_DENOM ? ' ✓' : ' ✗'}`));
console.log(`  E[face] = ${R.toFixed(solution.expectedFace, 6)}x   ${D('(hand-check: 0.44)')}`);
console.log(D(`  cumulative weights: ${CUMULATIVE_WEIGHTS.join(', ')}`));

// ---------------------------------------------------------------- wax ladder
console.log(`\n${B('Wax ladder')}`);
console.log(D('  inch     wax     payout on a 2.00x lot'));
for (let k = 1; k <= INCHES; k++) {
  const payout = payoutBase(10n ** 18n, 200, k);
  console.log(
    `  ${String(k).padStart(4)}${(waxBpAt(k) / 100).toFixed(0).padStart(8)}%` +
      `${(Number(payout) / 1e18).toFixed(2).padStart(20)}x`,
  );
}

// ---------------------------------------------------------------- the DP
console.log(`\n${B('Continuation values and claim thresholds')}`);
console.log(D('  inch     wax           A(k)       claim if face >='));
for (let k = 1; k <= INCHES; k++) {
  const t = solution.threshold[k];
  console.log(
    `  ${String(k).padStart(4)}${(waxBpAt(k) / 10000).toFixed(2).padStart(8)}` +
      `${R.toFixed(at(solution.continuation, k), 6).padStart(15)}` +
      `${(t === undefined ? 'forced' : R.toFixed(t, 5)).padStart(23)}`,
  );
}

// ---------------------------------------------------------------- headline
console.log(`\n${B('Headline figures')}`);
const reach = reachByInch(optimal);
const headline: ReadonlyArray<readonly [string, string]> = [
  ['Declared RTP (optimal play)', pct(solution.rtp)],
  ['   exact', R.toExactString(solution.rtp)],
  ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
  ['Max payout', `${R.toFixed(R.rat(MAX_FACE_BP, FACE_DENOM), 0)}x stake (first inch only)`],
  ['P(payout >= 1x)', pct(probabilityAtLeast(optimal, R.rat(1n)))],
  ['P(payout = 0)', pct(probabilityOfNothing(optimal))],
  ['P(payout >= 5x)', pct(probabilityAtLeast(optimal, R.rat(5n)))],
  ['Standard deviation', standardDeviation(optimal).toFixed(4)],
  ['Mean round length', `${R.toFixed(meanRoundLength(optimal), 2)} inches`],
  ['Reach probability by inch', reach.slice(1).map(r => pct(r, 2)).join(' / ')],
];
for (const [k, v] of headline) console.log(`  ${k.padEnd(30)} ${v}`);

// ---------------------------------------------------------------- band
console.log(`\n${B('Strategy band')}`);
console.log(D('  the jam requires 93–98%. Every policy a human would plausibly adopt is in range.'));
let bandOk = true;
for (const { label, policy, note } of strategyBand(solution)) {
  const value = evaluate(policy);
  const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
  const sensible = !label.startsWith('Hold for') && !label.startsWith('Claim the first');
  if (sensible && !inBand) bandOk = false;
  const flag = inBand ? '\x1b[32min band\x1b[0m' : sensible ? '\x1b[31mOUT OF BAND\x1b[0m' : D('out of band');
  console.log(`  ${label.padEnd(38)}${pct(value, 3).padStart(10)}  ${flag}${note ? D(`  ${note}`) : ''}`);
}

// ---------------------------------------------------------------- all 30 states
console.log(`\n${B(`All ${INCHES * LOTS.length} reachable (inch, lot) states`)}`);
console.log(D('  inch  lot                       payout    probability   settles?'));
const byKey = new Map(outcomes(optimal).map(o => [`${o.inch}:${o.lotId}`, o]));
let probabilitySum = R.ZERO;
let stateCount = 0;
for (let k = 1; k <= INCHES; k++) {
  for (const lot of LOTS) {
    stateCount++;
    const o = byKey.get(`${k}:${lot.id}`);
    const payout = R.mul(faceValue(lot), waxFraction(k));
    if (o) probabilitySum = R.add(probabilitySum, o.probability);
    console.log(
      `  ${String(k).padStart(4)}  ${lot.name.padEnd(23)}${R.toFixed(payout, 4).padStart(9)}x` +
        `${(o ? pct(o.probability, 4) : '—').padStart(15)}   ${o ? 'claim' : D('pass')}`,
    );
  }
}
console.log(D(`  ${stateCount} states enumerated`));

// ---------------------------------------------------------------- assertions
console.log(`\n${B('Assertions')}`);
let failed = 0;
const assert = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

assert('paytable weights sum to the denominator', weightSum === WEIGHT_DENOM);
assert(`all ${INCHES * LOTS.length} (inch, lot) states enumerated`, stateCount === INCHES * LOTS.length);
assert(
  'settlement probabilities sum to exactly 1',
  R.compare(probabilitySum, R.rat(1n)) === 0,
  R.toExactString(probabilitySum),
);
assert('RTP equals A(1) from the backward induction', R.compare(solution.rtp, at(solution.continuation, 1)) === 0);
assert(
  'the optimal policy beats every fixed threshold policy',
  strategyBand(solution)
    .filter(p => p.label !== 'Optimal')
    .every(p => R.compare(evaluate(p.policy), solution.rtp) <= 0),
);
assert('every sensible policy lands inside the jam band 93–98%', bandOk);
assert(
  'A(5) = wax(5) * E[face]',
  R.compare(at(solution.continuation, INCHES), R.mul(waxFraction(INCHES), solution.expectedFace)) === 0,
  'hand-check: 0.40 x 0.44 = 0.176',
);
assert('max payout is exactly 25x', R.compare(R.rat(MAX_FACE_BP, FACE_DENOM), R.rat(25n)) === 0);
assert(
  'pass mass at inches 1-3 = P(empty) + P(0.50x)',
  R.compare(at(reach, 2), R.rat(7690n, 10000n)) === 0,
  'hand-check: 0.6690 + 0.1000 = 0.7690',
);

console.log(
  `\n${failed === 0 ? '\x1b[32mVERIFIED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}  declared RTP ${B(pct(solution.rtp))}  =  ${R.toExactString(solution.rtp)}\n`,
);
process.exit(failed === 0 ? 0 : 1);
