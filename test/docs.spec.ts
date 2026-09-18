/**
 * The hand-written documents publish numbers too, and nothing regenerates them.
 *
 * `README.md` and everything under `public/` come out of the DP through
 * `gen:readme` / `gen:pages`, and CI fails on a diff — so those can never go
 * stale. `docs.md` §9.4 and §9.5 and `prd.md` §4.5 and §4.6 are prose, written
 * by hand, and they publish the same figures: the declared RTP, the strategy
 * band, the full outcome distribution, the reach-by-inch line. Today every one
 * of them is right. Nothing was making them stay right.
 *
 * That is the exact failure claude.md §8 exists to prevent — "every number
 * printed in the README, the UI, or the submission must come out of
 * `npm run verify:rtp`, not out of a memory or an estimate" — applied to the
 * two documents the rule forgot to name. A reviewer who checks a figure in
 * `docs.md` against the code and finds it stale has no way to tell which one is
 * lying, and the whole pitch of this repo is that they should never have to.
 *
 * So the documents are read and every published figure is recomputed here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  solve,
  optimalPolicy,
  thresholdPolicy,
  evaluate,
  outcomes,
  reachByInch,
  probabilityAtLeast,
  probabilityOfNothing,
  standardDeviation,
  meanRoundLength,
} from '../src/games/candle/core/solve';
import * as R from '../src/shared/math/rational';

const read = (name: string) => readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8');
const docs = read('docs.md');
const prd = read('prd.md');

const solution = solve();
const optimal = optimalPolicy(solution);

/** A percentage, the way both documents print one. */
const pct = (value: R.Rational, places: number) => `${R.toFixed(R.mul(value, R.rat(100n)), places)}%`;

describe('the declared RTP, wherever it is written by hand', () => {
  it('docs.md and prd.md both print what the DP computes', () => {
    expect(docs, 'docs.md §9.4 headline').toContain(pct(solution.rtp, 4));
    expect(docs, 'docs.md exact rational').toContain(R.toExactString(solution.rtp));
    expect(prd, 'prd.md §4.5 band table').toContain(pct(solution.rtp, 3));
  });
});

describe('the strategy band', () => {
  /** Exactly the rows both documents publish, by the face they threshold on. */
  const ROWS: readonly { readonly label: string; readonly minFaceBp: number }[] = [
    { label: 'Claim >= 1.00x', minFaceBp: 100 },
    { label: 'Claim >= 0.50x', minFaceBp: 50 },
    { label: 'Hold for >= 2.00x', minFaceBp: 200 },
    { label: 'Hold for >= 5.00x', minFaceBp: 500 },
  ];

  for (const row of ROWS) {
    it(`${row.label} is printed at the value the DP gives it`, () => {
      const value = pct(evaluate(thresholdPolicy(row.minFaceBp)), 3);
      expect(docs, `docs.md §9.5 — ${row.label}`).toContain(value);
      expect(prd, `prd.md §4.5 — ${row.label}`).toContain(value);
    });
  }

  it('the degenerate baseline is printed at 44.000%, the value D1 corrected it to', () => {
    // E[face] x wax(1), exactly — and the documents carry a note about the
    // 46.500% it used to read, which must not come back as a live figure.
    const value = R.mul(solution.expectedFace, R.rat(1n));
    expect(pct(value, 3)).toBe('44.000%');
    expect(docs).toContain('44.000%');
    expect(prd).toContain('44.0%');
  });
});

describe('the headline figures in docs.md §9.4', () => {
  it('P(payout >= 1x), P(payout = 0) and P(payout >= 5x)', () => {
    expect(docs).toContain(pct(probabilityAtLeast(optimal, R.rat(1n)), 4));
    expect(docs).toContain(pct(probabilityOfNothing(optimal), 4));
    expect(docs).toContain(pct(probabilityAtLeast(optimal, R.rat(5n)), 4));
  });

  it('the standard deviation and the mean round length', () => {
    expect(docs).toContain(standardDeviation(optimal).toFixed(4));
    expect(docs).toContain(R.toFixed(meanRoundLength(optimal), 2));
  });

  it('the reach-by-inch line, every rung of it', () => {
    // `reachByInch` is indexed BY INCH, so slot 0 is unused and the ladder
    // starts at 1.
    const reach = reachByInch(optimal);
    expect(R.toExactString(reach[1] as R.Rational), 'the first inch is always reached').toBe('1 / 1');
    // Both documents print that first rung as a bare "100%", then the rest to 2dp.
    expect(docs).toContain('100% / ');
    expect(prd).toContain('100% / ');
    for (const rung of reach.slice(2)) {
      const printed = pct(rung as R.Rational, 2);
      expect(docs, `docs.md reach ${printed}`).toContain(printed);
      expect(prd, `prd.md reach ${printed}`).toContain(printed);
    }
  });
});

describe('the outcome distribution in prd.md §4.6', () => {
  it('prints every payout the game can make, at the probability the DP gives it', () => {
    const byPayout = new Map<string, R.Rational>();
    for (const o of outcomes(optimal)) {
      const key = R.toFixed(o.payout, 6);
      byPayout.set(key, R.add(byPayout.get(key) ?? R.ZERO, o.probability));
    }
    expect(byPayout.size, 'the table has a row per distinct payout').toBe(22);

    let total = R.ZERO;
    for (const [, probability] of byPayout) total = R.add(total, probability);
    expect(R.toExactString(total), 'and they are a probability distribution').toBe('1 / 1');

    for (const [payout, probability] of byPayout) {
      const printed = pct(probability, 4);
      expect(prd, `prd.md §4.6 — ${Number(payout)}x at ${printed}`).toContain(printed);
    }
  });
});
