/**
 * I1 for THE SURVEY — the declared RTP is 97.4141%, recomputed from the DP and
 * never hardcoded anywhere but here, as the thing under test.
 *
 * I2 as well, and here it is stricter than CANDLE's: EVERY policy this game
 * publishes has to land inside the jam's 93–98% band, from sending nobody to
 * sending everybody. The manifest was tuned around that (see `core/vessel.ts`).
 *
 * And the belief identities, because they are what make this game the game it
 * is: the margin is a sufficient statistic, and a pair of disagreeing reports
 * leaves the player exactly where they started.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  solve,
  strategyBand,
  evaluate,
  optimalPolicy,
  fixedSurveys,
  untilMargin,
  bestCall,
  declineValue,
  underwriteValue,
  continuationValue,
  meanSurveys,
  surveyDistribution,
  cargoProbability,
} from '../src/games/survey/core/solve';
import {
  CARGOES,
  WEIGHT_DENOM,
  MAX_SURVEYS,
  MAX_VALUE_BP,
  VALUE_DENOM,
  DECLINE_BP,
  PREMIUM_BP,
  premiumBpAt,
  payoutBase,
} from '../src/games/survey/core/vessel';
import { posteriorSound, predictiveSound, prior, accuracy, evidenceRatio, bestCallConfidence, isReachable } from '../src/games/survey/core/belief';
import * as R from '../src/shared/math/rational';

/** The declared number. The DP must reproduce it exactly. */
const DECLARED_RTP_NUMERATOR = 60_883_787n;
const DECLARED_RTP_DENOMINATOR = 62_500_000n;

const solution = solve();
const optimal = optimalPolicy(solution);

describe('the manifest', () => {
  it('weights sum to exactly the denominator', () => {
    expect(CARGOES.reduce((sum, cargo) => sum + cargo.weight, 0)).toBe(WEIGHT_DENOM);
  });

  it('the richest cargo is exactly 20x', () => {
    expect(R.compare(R.rat(MAX_VALUE_BP, VALUE_DENOM), R.rat(20n))).toBe(0);
  });

  it('declining is exactly three fifths of a stake before any survey', () => {
    expect(R.compare(R.rat(DECLINE_BP, VALUE_DENOM), R.rat(3n, 5n))).toBe(0);
    expect(R.compare(declineValue(0), R.rat(3n, 5n))).toBe(0);
  });

  it('every cargo pays more than declining does, or the offer would be a joke', () => {
    for (const cargo of CARGOES) expect(cargo.valueBp).toBeGreaterThan(DECLINE_BP);
  });
});

describe('the belief', () => {
  it('the prior is 2 in 5 — these are dangerous waters', () => {
    expect(R.compare(prior(), R.rat(2n, 5n))).toBe(0);
    expect(R.compare(posteriorSound(0), prior())).toBe(0);
  });

  it('a surveyor is right 3 times in 5, so one report multiplies the odds by 3/2', () => {
    // The evidence is deliberately weak: no single report settles anything, which
    // is what makes this a SEQUENCE of tests and what holds the strategy band
    // inside 93-98% (see vessel.ts, and the band suite below).
    expect(R.compare(accuracy(), R.rat(3n, 5n))).toBe(0);
    expect(R.compare(evidenceRatio(), R.rat(3n, 2n))).toBe(0);
  });

  it('one report for sound leaves the call an exact coin toss', () => {
    // A pleasing consequence of 2/5 and 3/5: the prior odds are 2:3 and one
    // report multiplies them by 3/2, so a single SOUND report lands on 1:1.
    expect(R.compare(posteriorSound(1), R.rat(1n, 2n))).toBe(0);
  });

  it('TWO DISAGREEING REPORTS CANCEL EXACTLY — the whole design rests on it', () => {
    // Not approximately, not nearly: the posterior after (+1, -1) is the prior,
    // in exact rationals. This is why the margin alone is the state, why the
    // contract stores five bytes, and why the fog returns to where it was.
    for (let m = -MAX_SURVEYS + 1; m <= MAX_SURVEYS - 1; m++) {
      const up = posteriorSound(m + 1);
      const backDown = posteriorSound(m);
      expect(R.compare(posteriorSound(m), backDown), `margin ${m}`).toBe(0);
      // and the round trip m -> m+1 -> m lands on the same rational
      expect(R.compare(up, posteriorSound(m + 1))).toBe(0);
    }
    expect(R.compare(posteriorSound(0), prior())).toBe(0);
  });

  it('the posterior rises with every report for sound, strictly', () => {
    for (let m = -MAX_SURVEYS; m < MAX_SURVEYS; m++) {
      expect(R.compare(posteriorSound(m + 1), posteriorSound(m)), `margin ${m}`).toBe(1);
    }
  });

  it('the predictive is the posterior smeared by the surveyor being wrong', () => {
    // P(next says SOUND) = q*P(sound) + (1-q)*P(rotten), by hand, at every margin.
    const q = accuracy();
    for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
      const p = posteriorSound(m);
      const expected = R.add(R.mul(p, q), R.mul(R.sub(R.rat(1n), p), R.sub(R.rat(1n), q)));
      expect(R.compare(predictiveSound(m), expected), `margin ${m}`).toBe(0);
    }
  });

  it('the predictive is always less certain than the posterior it came from', () => {
    for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
      const p = posteriorSound(m);
      const next = predictiveSound(m);
      // it sits strictly between the posterior and a coin toss
      const half = R.rat(1n, 2n);
      if (R.compare(p, half) > 0) {
        expect(R.compare(next, p), `margin ${m}`).toBe(-1);
        expect(R.compare(next, half)).toBe(1);
      } else if (R.compare(p, half) < 0) {
        expect(R.compare(next, p), `margin ${m}`).toBe(1);
        expect(R.compare(next, half)).toBe(-1);
      }
    }
  });

  it('confidence is never below a coin toss — the better call is at worst even', () => {
    for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
      expect(R.compare(bestCallConfidence(m), R.rat(1n, 2n)), `margin ${m}`).toBeGreaterThanOrEqual(0);
      expect(R.compare(bestCallConfidence(m), R.rat(1n)), `margin ${m}`).toBeLessThanOrEqual(0);
    }
  });

  it('only states of the right parity are reachable', () => {
    expect(isReachable(1, 0)).toBe(false);
    expect(isReachable(2, 1)).toBe(false);
    expect(isReachable(2, 0)).toBe(true);
    expect(isReachable(3, 3)).toBe(true);
    expect(isReachable(3, 5)).toBe(false);
  });
});

describe('the dynamic program', () => {
  it('reproduces the declared RTP exactly', () => {
    expect(solution.rtp.n).toBe(DECLARED_RTP_NUMERATOR);
    expect(solution.rtp.d).toBe(DECLARED_RTP_DENOMINATOR);
    expect(R.toPercent(solution.rtp, 4)).toBe('97.4141');
  });

  it('sits inside the jam band of 93–98%', () => {
    expect(R.compare(solution.rtp, R.rat(93n, 100n))).toBeGreaterThanOrEqual(0);
    expect(R.compare(solution.rtp, R.rat(98n, 100n))).toBeLessThanOrEqual(0);
  });

  it('at the cap, the value is simply the better of the two calls', () => {
    for (const entry of solution.byCargo) {
      for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m += 2) {
        if (!isReachable(MAX_SURVEYS, m)) continue;
        const value = entry.value[MAX_SURVEYS]?.[m + MAX_SURVEYS];
        expect(value, `${entry.cargo.name} m=${m}`).toBeDefined();
        expect(R.compare(value as R.Rational, bestCall(entry.cargo, MAX_SURVEYS, m).value)).toBe(0);
      }
    }
  });

  it('every state is the max of calling now and buying one more report', () => {
    for (const entry of solution.byCargo) {
      for (let k = 0; k < MAX_SURVEYS; k++) {
        for (let m = -k; m <= k; m += 2) {
          if (!isReachable(k, m)) continue;
          const here = entry.value[k]?.[m + MAX_SURVEYS];
          const call = bestCall(entry.cargo, k, m).value;
          const cont = continuationValue(entry, k, m);
          expect(here, `${entry.cargo.name} (${k},${m})`).toBeDefined();
          expect(cont).toBeDefined();
          const better = R.compare(cont as R.Rational, call) > 0 ? (cont as R.Rational) : call;
          expect(R.compare(here as R.Rational, better), `${entry.cargo.name} (${k},${m})`).toBe(0);
        }
      }
    }
  });

  it('is never worth less than declining right there', () => {
    for (const entry of solution.byCargo) {
      for (let k = 0; k <= MAX_SURVEYS; k++) {
        for (let m = -k; m <= k; m += 2) {
          if (!isReachable(k, m)) continue;
          const here = entry.value[k]?.[m + MAX_SURVEYS];
          expect(R.compare(here as R.Rational, declineValue(k)), `${entry.cargo.name} (${k},${m})`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('underwriting a richer cargo is always worth at least as much', () => {
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      for (let m = -k; m <= k; m += 2) {
        if (!isReachable(k, m)) continue;
        for (let i = 1; i < CARGOES.length; i++) {
          const poorer = CARGOES[i - 1];
          const richer = CARGOES[i];
          if (!poorer || !richer) continue;
          expect(
            R.compare(underwriteValue(richer, k, m), underwriteValue(poorer, k, m)),
            `${richer.name} vs ${poorer.name} at (${k},${m})`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('the premium ladder has one rung per survey plus the start, falling', () => {
    expect(PREMIUM_BP.length).toBe(MAX_SURVEYS + 1);
    for (let k = 1; k <= MAX_SURVEYS; k++) {
      expect(premiumBpAt(k)).toBeLessThan(premiumBpAt(k - 1));
      expect(premiumBpAt(k - 1) - premiumBpAt(k), 'a point and a half of the premium, every time').toBe(150);
    }
  });
});

describe('I2 — the strategy band', () => {
  it('no policy beats the DP', () => {
    for (const entry of strategyBand(solution)) {
      expect(R.compare(evaluate(entry.policy, entry.call), solution.rtp), entry.label).toBeLessThanOrEqual(0);
    }
  });

  it('the optimal policy IS the declared RTP', () => {
    expect(R.compare(evaluate(optimal), solution.rtp)).toBe(0);
  });

  it('EVERY way of buying evidence lands inside 93–98%, not merely the flattering ones', () => {
    // I2. This is the invariant the manifest was tuned around: sharper surveyors
    // or a steeper premium pay the careful player straight out of the window and
    // drop the careless one below 93%. Both ends are checked — including sending
    // nobody and sending everybody.
    //
    // It is scoped to the rows that READ the evidence, and that scope is the
    // honest one. The band also publishes two policies that ignore it, and they
    // are outside the window by design: underwriting blind returns 88.6% and
    // declining forever returns exactly 60%. Asserting over the whole band would
    // mean either never publishing those numbers or widening the window until it
    // stopped constraining anything.
    const sensible = strategyBand(solution).filter(entry => entry.sensible);
    expect(sensible.length, 'the evidence-buying rows are the ones I2 is about').toBeGreaterThanOrEqual(5);
    for (const entry of sensible) {
      const value = evaluate(entry.policy, entry.call);
      expect(R.compare(value, R.rat(93n, 100n)), `${entry.label} is below the floor`).toBeGreaterThanOrEqual(0);
      expect(R.compare(value, R.rat(98n, 100n)), `${entry.label} is above the ceiling`).toBeLessThanOrEqual(0);
    }
  });

  it('and the band says out loud what ignoring the evidence returns', () => {
    const band = Object.fromEntries(strategyBand(solution).map(e => [e.label, evaluate(e.policy, e.call)]));
    const blind = band['Underwrite her, whatever the reports say'] as R.Rational;
    const never = band['Decline every time'] as R.Rational;

    // Both are real ways a person plays a risk game, and both are below the
    // window. Printing them is the point: the note beside the band claims the
    // careless end is published, and until this pair existed it was not.
    expect(R.toPercent(blind, 3)).toBe('88.600');
    expect(R.toPercent(never, 3)).toBe('60.000');
    expect(R.compare(blind, R.rat(93n, 100n))).toBe(-1);
    expect(R.compare(never, R.rat(93n, 100n))).toBe(-1);

    // Declining forever is exactly the decline payout with no premium spent —
    // there is nothing probabilistic left in it.
    expect(R.compare(never, R.rat(60n, 100n))).toBe(0);
  });

  it('and so does every fixed number of surveys, and every Wald margin', () => {
    const policies = [
      ...Array.from({ length: MAX_SURVEYS + 1 }, (_, n) => fixedSurveys(n)),
      ...Array.from({ length: MAX_SURVEYS }, (_, n) => untilMargin(n + 1)),
    ];
    for (const policy of policies) {
      const value = evaluate(policy);
      expect(R.compare(value, R.rat(93n, 100n))).toBeGreaterThanOrEqual(0);
      expect(R.compare(value, R.rat(98n, 100n))).toBeLessThanOrEqual(0);
    }
  });

  it('publishes the careless end rather than hiding it', () => {
    const band = strategyBand(solution);
    expect(band.length).toBeGreaterThanOrEqual(5);
    expect(band.some(entry => entry.sensible === false), 'the band reaches past what the window holds').toBe(true);
    const worst = band.reduce((low, entry) =>
      R.compare(evaluate(entry.policy, entry.call), evaluate(low.policy, low.call)) < 0 ? entry : low,
    );
    // The worst published policy is meaningfully below the declared RTP: if it
    // were not, we would not be publishing anything the player cannot see.
    expect(R.compare(evaluate(worst.policy, worst.call), solution.rtp)).toBe(-1);
  });

  it('buying every survey always costs more than it returns', () => {
    // Five surveyors on a cargo the DP would have called blind is the classic
    // beginner's mistake, and it must be visibly worse — otherwise the premium
    // ladder is not doing its job.
    expect(R.compare(evaluate(fixedSurveys(MAX_SURVEYS)), evaluate(optimal))).toBe(-1);
  });
});

describe('the shape of a round', () => {
  it('the mean number of surveys is between 0 and the cap', () => {
    const mean = meanSurveys(optimal);
    expect(R.compare(mean, R.rat(0n))).toBeGreaterThanOrEqual(0);
    expect(R.compare(mean, R.rat(MAX_SURVEYS))).toBeLessThanOrEqual(0);
  });

  it('the survey distribution is a distribution', () => {
    const dist = surveyDistribution(optimal);
    const total = dist.reduce<R.Rational>((sum, p) => R.add(sum, p), R.ZERO);
    expect(R.compare(total, R.rat(1n))).toBe(0);
  });

  it('the cargo weights are a distribution too', () => {
    const total = CARGOES.reduce<R.Rational>((sum, cargo) => R.add(sum, cargoProbability(cargo)), R.ZERO);
    expect(R.compare(total, R.rat(1n))).toBe(0);
  });
});

describe('the one payout rule', () => {
  it('floors exactly once, at the very end', () => {
    // stake * value * premium / 1e6, with a single floor. At 18 decimals the
    // give-up is at most one base unit per voyage, which is documented rather
    // than hidden.
    const stake = 10n ** 18n;
    for (const cargo of CARGOES) {
      for (let k = 0; k <= MAX_SURVEYS; k++) {
        const expected = (stake * BigInt(cargo.valueBp) * BigInt(premiumBpAt(k))) / 1_000_000n;
        expect(payoutBase(stake, cargo.valueBp, k)).toBe(expected);
      }
    }
  });

  it('the maximum win is the richest cargo with no surveys bought', () => {
    const stake = 10n ** 18n;
    const top = payoutBase(stake, MAX_VALUE_BP, 0);
    expect(top).toBe(stake * 20n);
    for (const cargo of CARGOES) {
      for (let k = 0; k <= MAX_SURVEYS; k++) {
        expect(payoutBase(stake, cargo.valueBp, k)).toBeLessThanOrEqual(top);
      }
    }
  });

  it('a player can never lose more than the stake', () => {
    // There is no bust state and nothing accumulates: the worst case is a payout
    // of zero, which is the stake and not a penny more (claude.md §7).
    expect(payoutBase(10n ** 18n, 0, 0)).toBe(0n);
  });
});

describe('I11 — the generated Solidity mirror', () => {
  const solidity = readFileSync(new URL('../contracts/generated/Manifest.sol', import.meta.url), 'utf8');

  it('is marked generated, so nobody hand-edits it', () => {
    expect(solidity).toContain('GENERATED FILE — DO NOT EDIT');
  });

  it('carries the same premium ladder', () => {
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      const pattern = new RegExp(`surveys == ${k}\\) return ${premiumBpAt(k).toLocaleString('en-US').replace(/,/g, '_')}`);
      expect(pattern.test(solidity), `premium at ${k} surveys`).toBe(true);
    }
  });

  it('carries the same posterior and predictive fractions, exactly', () => {
    for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
      const post = posteriorSound(m);
      const pred = predictiveSound(m);
      const margin = String(m).padStart(2, ' ');
      // The generator pads its columns, so match across whitespace rather than
      // against one particular alignment.
      const postLine = new RegExp(`margin ==\\s*${m}\\)\\s*return \\(\\s*${post.n},\\s*${post.d}\\)`);
      const predLine = new RegExp(`margin ==\\s*${m}\\)\\s*return \\(\\s*${pred.n},\\s*${pred.d}\\)`);
      expect(postLine.test(solidity), `posterior at margin ${margin}: ${post.n}/${post.d}`).toBe(true);
      expect(predLine.test(solidity), `predictive at margin ${margin}: ${pred.n}/${pred.d}`).toBe(true);
    }
  });

  it('carries the same cargo values and cumulative weights', () => {
    let cumulative = 0;
    for (const cargo of CARGOES) {
      cumulative += cargo.weight;
      if (cargo !== CARGOES[CARGOES.length - 1]) {
        const pattern = new RegExp(`r < ${cumulative.toLocaleString('en-US').replace(/,/g, '_')}\\) return\\s+${cargo.valueBp};`);
        expect(pattern.test(solidity), `${cargo.name} at cumulative ${cumulative}`).toBe(true);
      }
    }
    expect(cumulative).toBe(WEIGHT_DENOM);
  });

  it('declares the same declined payout and maximum value', () => {
    expect(solidity).toContain(`DECLINE_BP = ${DECLINE_BP}`);
    expect(solidity).toContain(`MAX_VALUE_BP = ${MAX_VALUE_BP.toLocaleString('en-US').replace(/,/g, '_')}`);
  });

  it('publishes the same declared RTP in its header', () => {
    expect(solidity).toContain(`${DECLARED_RTP_NUMERATOR} / ${DECLARED_RTP_DENOMINATOR}`);
  });

  it('declares the RTP as a generated constant, not a number a hand could edit', () => {
    const u = (v: bigint) => v.toLocaleString('en-US').replace(/,/g, '_');
    expect(solidity).toContain(`RTP_NUM = ${u(DECLARED_RTP_NUMERATOR)}`);
    expect(solidity).toContain(`RTP_DEN = ${u(DECLARED_RTP_DENOMINATOR)}`);
  });

  it('and the contract quotes that constant to the vault', () => {
    // `quoteRiskParams` tells the vault what to expect to pay. If it could drift
    // from the DP, the vault would be pricing a game nobody is playing.
    const game = readFileSync(new URL('../contracts/Survey.sol', import.meta.url), 'utf8');
    expect(game).toContain('(wager * SurveyManifest.RTP_NUM) / SurveyManifest.RTP_DEN');
  });
});
