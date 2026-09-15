/**
 * `npm run verify:survey` — the exhaustive recomputation for THE SURVEY.
 *
 * Every number printed here comes out of the DP in
 * `src/games/survey/core/solve.ts`, in exact BigInt rationals. Nothing is read
 * from a constant. Same standard as `verify:rtp` (claude.md §8).
 */
import { CARGOES, WEIGHT_DENOM, VALUE_DENOM, MAX_SURVEYS, MAX_VALUE_BP, PREMIUM_BP, DECLINE_BP, PRIOR_SOUND_NUM, PRIOR_SOUND_DEN, ACCURACY_NUM, ACCURACY_DEN, premiumBpAt, CUMULATIVE_WEIGHTS } from '../src/games/survey/core/vessel';
import { posteriorSound, predictiveSound, prior, accuracy, evidenceRatio, isReachable } from '../src/games/survey/core/belief';
import { solve, strategyBand, evaluate, bestCall, meanSurveys, surveyDistribution, cargoProbability, declineValue, marginIndex } from '../src/games/survey/core/solve';
import * as R from '../src/shared/math/rational';

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const pct = (r: R.Rational, p = 4) => `${R.toPercent(r, p)}%`;

const solution = solve();
const optimal = strategyBand(solution)[0]!.policy;

console.log(`\n${B('THE SURVEY — RTP verification')}`);
console.log(D('every number below is recomputed from the manifest in exact rationals\n'));

console.log(B('The manifest'));
console.log(D('  cargo        pays     weight     chance'));
for (const cargo of CARGOES) {
  console.log(
    `  ${cargo.name.padEnd(11)}${(cargo.valueBp / VALUE_DENOM).toFixed(2).padStart(6)}x` +
      `${String(cargo.weight).padStart(10)}${pct(cargoProbability(cargo), 2).padStart(11)}`,
  );
}
const weightSum = CARGOES.reduce((s, c) => s + c.weight, 0);
console.log(D(`  weights sum to ${weightSum} / ${WEIGHT_DENOM}${weightSum === WEIGHT_DENOM ? ' ✓' : ' ✗'}`));
console.log(D(`  cumulative: ${CUMULATIVE_WEIGHTS.join(', ')}`));

console.log(`\n${B('The ship, and the surveyors')}`);
console.log(`  P(sound) before any survey     ${R.toFixed(prior(), 4)}   ${D(`${PRIOR_SOUND_NUM}/${PRIOR_SOUND_DEN} — these are dangerous waters`)}`);
console.log(`  a surveyor is right            ${R.toFixed(accuracy(), 4)}   ${D(`${ACCURACY_NUM}/${ACCURACY_DEN}`)}`);
console.log(`  evidence weight of one report  ${R.toFixed(evidenceRatio(), 4)}   ${D('odds multiply by this')}`);
console.log(`  declining hands back           ${(DECLINE_BP / VALUE_DENOM).toFixed(2)}x  ${D('of the premium')}`);

console.log(`\n${B('What the reports add up to')}`);
console.log(D('  margin = reports for sound minus reports for rot. Disagreeing reports cancel.'));
console.log(D('  margin   P(sound)   next report says SOUND'));
for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
  console.log(`  ${String(m).padStart(6)}   ${R.toFixed(posteriorSound(m), 4).padStart(8)}   ${R.toFixed(predictiveSound(m), 4).padStart(18)}`);
}

console.log(`\n${B('The premium ladder')}`);
console.log(D('  surveys   premium   declining pays'));
for (let k = 0; k <= MAX_SURVEYS; k++) {
  console.log(`  ${String(k).padStart(7)}${`${premiumBpAt(k) / 100}%`.padStart(10)}${R.toFixed(declineValue(k), 4).padStart(17)}`);
}

console.log(`\n${B('Each voyage, played optimally')}`);
console.log(D('  cargo        pays   blind call    value at the start'));
for (const s of solution.byCargo) {
  console.log(
    `  ${s.cargo.name.padEnd(11)}${(s.cargo.valueBp / VALUE_DENOM).toFixed(2).padStart(6)}x   ` +
      `${bestCall(s.cargo, 0, 0).call.padEnd(12)}${R.toFixed(s.atStart, 6).padStart(10)}`,
  );
}

console.log(`\n${B('Headline figures')}`);
const dist = surveyDistribution(optimal);
const rows: ReadonlyArray<readonly [string, string]> = [
  ['Declared RTP (optimal play)', pct(solution.rtp)],
  ['   exact', R.toExactString(solution.rtp)],
  ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
  ['Maximum payout', `${(MAX_VALUE_BP / VALUE_DENOM).toFixed(0)}x stake (no surveys)`],
  ['Mean surveys bought', R.toFixed(meanSurveys(optimal), 3)],
  ['Surveys bought', dist.map((p, k) => `${k}:${R.toPercent(p, 1)}%`).join('  ')],
];
for (const [k, v] of rows) console.log(`  ${k.padEnd(28)} ${v}`);

console.log(`\n${B('Strategy band')}`);
console.log(D('  Every way of playing this a person would actually adopt — including sending'));
console.log(D('  nobody, and including sending everybody — sits inside the jam band. That is'));
console.log(D('  what the surveyor\'s accuracy and the price of a survey were chosen to hold:'));
console.log(D('  sharper evidence would pay the careful player out of the window.'));
for (const { label, policy, note } of strategyBand(solution)) {
  const value = evaluate(policy);
  const inBand = R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;
  console.log(
    `  ${label.padEnd(38)}${pct(value, 3).padStart(9)}  ` +
      `${inBand ? '\x1b[32min band\x1b[0m' : '\x1b[33mbelow 93%\x1b[0m'}${note ? D(`  ${note}`) : ''}`,
  );
}

console.log(`\n${B('Every reachable (surveys, margin) state')}`);
let states = 0;
for (let k = 0; k <= MAX_SURVEYS; k++) for (let m = -k; m <= k; m += 2) if (isReachable(k, m)) states++;
console.log(D(`  ${states} states per cargo, ${states * CARGOES.length} in all`));

console.log(`\n${B('Assertions')}`);
let failed = 0;
const assert = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};
assert('manifest weights sum to the denominator', weightSum === WEIGHT_DENOM);
assert('the declared RTP sits inside the jam band 93–98%',
  R.compare(solution.rtp, R.rat(93n, 100n)) >= 0 && R.compare(solution.rtp, R.rat(98n, 100n)) <= 0, pct(solution.rtp));
assert('no policy beats the DP', strategyBand(solution).slice(1).every(p => R.compare(evaluate(p.policy), solution.rtp) <= 0));
assert('the premium ladder has one rung per survey plus the start', PREMIUM_BP.length === MAX_SURVEYS + 1);
assert('a disagreeing pair of reports cancels exactly',
  R.compare(posteriorSound(0), prior()) === 0, 'margin 0 is the prior, whatever was bought');
assert('the posterior rises with every report for sound',
  Array.from({ length: 2 * MAX_SURVEYS }, (_, i) => i - MAX_SURVEYS).every(m => R.compare(posteriorSound(m + 1), posteriorSound(m)) > 0));
assert('declining always pays less than the stake', R.compare(declineValue(0), R.rat(1n)) < 0, `${R.toFixed(declineValue(0), 2)}x`);
assert('the richest cargo is the maximum payout', MAX_VALUE_BP === Math.max(...CARGOES.map(c => c.valueBp)));
assert('margin is a sufficient statistic', marginIndex(0) === MAX_SURVEYS);

console.log(`\n${failed === 0 ? '\x1b[32mVERIFIED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'}  declared RTP ${B(pct(solution.rtp))}  =  ${R.toExactString(solution.rtp)}\n`);
process.exit(failed === 0 ? 0 : 1);
