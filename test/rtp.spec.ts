/**
 * I1 — the declared RTP is 96.9961%, recomputed from the DP, never hardcoded.
 *
 * The declared constant appears exactly once in this file, as the thing under
 * test. Everything else is derived (claude.md §2).
 */
import { describe, it, expect } from 'vitest';
import { solve, optimalPolicy, evaluate, outcomes, reachByInch, probabilityAtLeast, probabilityOfNothing, meanRoundLength, standardDeviation, expectedFace, faceValue, waxFraction, lotProbability } from '../src/games/candle/core/solve';
import { LOTS, WEIGHT_DENOM, MAX_FACE_BP, FACE_DENOM } from '../src/games/candle/core/paytable';
import { INCHES } from '../src/games/candle/core/wax';
import * as R from '../src/games/candle/core/rational';

/** The declared numbers from docs.md §9.4. The DP must reproduce them. */
const DECLARED_RTP_NUMERATOR = 7_577_820_426_157n;
const DECLARED_RTP_DENOMINATOR = 7_812_500_000_000n;

const solution = solve();
const optimal = optimalPolicy(solution);
const at = (list: readonly (R.Rational | undefined)[], i: number): R.Rational => {
  const v = list[i];
  if (v === undefined) throw new Error(`missing index ${i}`);
  return v;
};

describe('paytable', () => {
  it('weights sum to exactly the denominator', () => {
    expect(LOTS.reduce((s, l) => s + l.weight, 0)).toBe(WEIGHT_DENOM);
  });

  it('E[face] is exactly 0.44 (hand-checkable, docs.md §9.6)', () => {
    expect(R.compare(expectedFace(), R.rat(44n, 100n))).toBe(0);
  });

  it('the top lot is exactly 25x', () => {
    expect(R.compare(R.rat(MAX_FACE_BP, FACE_DENOM), R.rat(25n))).toBe(0);
  });
});

describe('the dynamic program', () => {
  it('A(5) = wax(5) * E[face] = 0.176', () => {
    expect(R.compare(at(solution.continuation, INCHES), R.rat(176n, 1000n))).toBe(0);
  });

  it('reproduces every continuation value in docs.md §9.3 to 6 places', () => {
    const declared = ['0.969961', '0.754176', '0.549643', '0.359744', '0.176000'];
    for (let k = 1; k <= INCHES; k++) {
      expect(R.toFixed(at(solution.continuation, k), 6), `A(${k})`).toBe(declared[k - 1]);
    }
  });

  it('reproduces every claim threshold in docs.md §9.3 to 5 places', () => {
    const declared = ['0.75418', '0.64664', '0.51392', '0.32000'];
    for (let k = 1; k < INCHES; k++) {
      expect(R.toFixed(at(solution.threshold, k), 5), `threshold(${k})`).toBe(declared[k - 1]);
    }
    expect(solution.threshold[INCHES]).toBeUndefined();
  });

  it('the threshold is exactly A(k+1) / wax(k)', () => {
    for (let k = 1; k < INCHES; k++) {
      const expected = R.div(at(solution.continuation, k + 1), waxFraction(k));
      expect(R.compare(at(solution.threshold, k), expected)).toBe(0);
    }
  });

  it('continuation values fall monotonically as the wax burns', () => {
    for (let k = 1; k < INCHES; k++) {
      expect(R.compare(at(solution.continuation, k), at(solution.continuation, k + 1))).toBe(1);
    }
  });
});

describe('I1 — the declared RTP', () => {
  it('is exactly 7577820426157 / 7812500000000', () => {
    expect(solution.rtp.n).toBe(DECLARED_RTP_NUMERATOR);
    expect(solution.rtp.d).toBe(DECLARED_RTP_DENOMINATOR);
  });

  it('prints as 96.9961%', () => {
    expect(R.toPercent(solution.rtp, 4)).toBe('96.9961');
  });

  it('equals A(1) from the backward induction', () => {
    expect(R.compare(solution.rtp, at(solution.continuation, 1))).toBe(0);
  });

  it('equals the value of playing the optimal policy', () => {
    expect(R.compare(evaluate(optimal), solution.rtp)).toBe(0);
  });

  it('sits inside the jam band 93-98%', () => {
    expect(R.compare(solution.rtp, R.rat(93n, 100n))).toBeGreaterThanOrEqual(0);
    expect(R.compare(solution.rtp, R.rat(98n, 100n))).toBeLessThanOrEqual(0);
  });

  it('leaves a house edge of 3.0039%', () => {
    expect(R.toPercent(R.sub(R.rat(1n), solution.rtp), 4)).toBe('3.0039');
  });
});

describe('the outcome distribution (docs.md §4.6, §9.4)', () => {
  it('enumerates all 30 (inch, lot) states', () => {
    expect(INCHES * LOTS.length).toBe(30);
  });

  it('settlement probabilities sum to exactly 1', () => {
    const total = outcomes(optimal).reduce<R.Rational>((s, o) => R.add(s, o.probability), R.ZERO);
    expect(R.compare(total, R.rat(1n))).toBe(0);
  });

  it('reproduces the reach probabilities: 100 / 76.90 / 59.14 / 45.48 / 30.42', () => {
    const declared = ['100.00', '76.90', '59.14', '45.48', '30.42'];
    const reach = reachByInch(optimal);
    for (let k = 1; k <= INCHES; k++) {
      expect(R.toPercent(at(reach, k), 2), `reach(${k})`).toBe(declared[k - 1]);
    }
  });

  it('reach at inch 2 is exactly P(empty) + P(0.50x) = 0.7690', () => {
    expect(R.compare(at(reachByInch(optimal), 2), R.rat(7690n, 10000n))).toBe(0);
  });

  it('reproduces P(payout >= 1x) = 36.4741%', () => {
    expect(R.toPercent(probabilityAtLeast(optimal, R.rat(1n)), 4)).toBe('36.4741');
  });

  it('reproduces P(payout = 0) = 20.3531%', () => {
    expect(R.toPercent(probabilityOfNothing(optimal), 4)).toBe('20.3531');
  });

  it('reproduces P(payout >= 5x) = 2.0239%', () => {
    expect(R.toPercent(probabilityAtLeast(optimal, R.rat(5n)), 4)).toBe('2.0239');
  });

  it('reproduces the mean round length of 3.12 inches', () => {
    expect(R.toFixed(meanRoundLength(optimal), 2)).toBe('3.12');
  });

  it('reproduces the standard deviation of 1.7568', () => {
    expect(standardDeviation(optimal).toFixed(4)).toBe('1.7568');
  });

  it('P(payout = 25x) is exactly P(the top lot at the first inch) = 0.2%', () => {
    const top = LOTS[LOTS.length - 1];
    if (!top) throw new Error('empty paytable');
    expect(R.compare(probabilityAtLeast(optimal, R.rat(25n)), lotProbability(top))).toBe(0);
  });

  it('25x is reachable only at the first inch', () => {
    const jackpots = outcomes(optimal).filter(o => R.compare(o.payout, R.rat(25n)) === 0);
    expect(jackpots).toHaveLength(1);
    expect(jackpots[0]?.inch).toBe(1);
  });

  it('every settled payout equals face x wax for its state', () => {
    for (const o of outcomes(optimal)) {
      const lot = LOTS[o.lotId];
      if (!lot) throw new Error(`no lot ${o.lotId}`);
      expect(R.compare(o.payout, R.mul(faceValue(lot), waxFraction(o.inch))), `${o.inch}:${o.lotId}`).toBe(0);
    }
  });
});
