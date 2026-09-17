/**
 * I1 for THE BROKERS — the declared RTP is 96.9637%, recomputed from the DP and
 * never hardcoded anywhere but here, as the thing under test.
 *
 * I2 in its strict form: EVERY policy this game publishes lands inside the jam's
 * 93–98% band, from taking the first price offered to asking everybody.
 *
 * And the theorem. Weitzman's index rule is the reason this game exists, so it
 * is checked rather than cited: the same choice as the dynamic program, at every
 * reachable state, and the same RTP to the last digit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  solve,
  strategyBand,
  evaluate,
  optimalPolicy,
  pandoraPolicy,
  optimalChoice,
  takeValue,
  askValue,
  maximumPayout,
  roundShape,
  askByMeanOrder,
  probabilityAtLeast,
  MASKS,
  PRICES,
} from '../src/games/brokers/core/solve';
import {
  BROKER_LIST,
  HOUSE,
  WEIGHT_DENOM,
  PRICE_DENOM,
  MAX_PAYOUT_BP,
  TOTAL_FEES_BP,
  feesForMask,
  payoutBase,
  priceForDraw,
} from '../src/games/brokers/core/market';
import { reservationPrice, surplusAbove, meanPrice, askingOrder, feeValue, priceValue } from '../src/games/brokers/core/weitzman';
import * as R from '../src/shared/math/rational';

/** The declared number. The DP must reproduce it exactly. */
const DECLARED_RTP_NUMERATOR = 1_551_418_623n;
const DECLARED_RTP_DENOMINATOR = 1_600_000_000n;

const solution = solve();
const optimal = optimalPolicy(solution);
const pandora = pandoraPolicy();

/** Could this price be in hand with exactly these brokers asked? */
const reachable = (mask: number, price: number): boolean => {
  if (HOUSE.some(q => q.priceBp === price)) return true;
  return BROKER_LIST.some(b => (mask & (1 << b.id)) !== 0 && b.quotes.some(q => q.priceBp === price));
};

describe('the market', () => {
  it('every quote table sums to exactly the denominator', () => {
    for (const quotes of [HOUSE, ...BROKER_LIST.map(b => b.quotes)]) {
      expect(quotes.reduce((sum, quote) => sum + quote.weight, 0)).toBe(WEIGHT_DENOM);
    }
  });

  it('maps the boundaries of every weight table exactly', () => {
    // An off-by-one here would move real probability between prices and nothing
    // would visibly break.
    for (const quotes of [HOUSE, ...BROKER_LIST.map(b => b.quotes)]) {
      let cumulative = 0;
      for (const quote of quotes) {
        expect(priceForDraw(quotes, cumulative)).toBe(quote.priceBp);
        cumulative += quote.weight;
        expect(priceForDraw(quotes, cumulative - 1)).toBe(quote.priceBp);
      }
      expect(() => priceForDraw(quotes, WEIGHT_DENOM)).toThrow(RangeError);
      expect(() => priceForDraw(quotes, -1)).toThrow(RangeError);
    }
  });

  it('the fees live in the mask and nowhere else', () => {
    for (let mask = 0; mask < MASKS; mask++) {
      const expected = BROKER_LIST.filter(b => mask & (1 << b.id)).reduce((sum, b) => sum + b.feeBp, 0);
      expect(feesForMask(mask)).toBe(expected);
    }
    expect(feesForMask(MASKS - 1)).toBe(TOTAL_FEES_BP);
  });

  it('the house charges nothing, and is the only one who does not', () => {
    expect(BROKER_LIST.every(broker => broker.feeBp > 0)).toBe(true);
  });
});

describe("Weitzman's index", () => {
  it('solves its own defining equation, exactly, for every broker', () => {
    // z is the price at which the fee exactly pays for itself: E[(X - z)^+] = c.
    for (const broker of BROKER_LIST) {
      const z = reservationPrice(broker);
      expect(R.compare(surplusAbove(broker, z), feeValue(broker.feeBp)), broker.name).toBe(0);
    }
  });

  it('is not the average — and for this market it is the reverse of it', () => {
    // The whole teachable point of the game: the best average price on the floor
    // belongs to the LAST man worth asking.
    const byMean = [...BROKER_LIST].sort((a, b) => R.compare(meanPrice(b), meanPrice(a)));
    const byIndex = askingOrder();
    expect(byMean[0]?.id).toBe(byIndex[byIndex.length - 1]?.id);
    expect(byMean[byMean.length - 1]?.id).toBe(byIndex[1]?.id);
  });

  it('sits above every price the house can open with, so nobody is dead weight', () => {
    // A broker whose index is below the worst opening price could never be worth
    // asking, and would be a line in the manifest that never does anything.
    const worstOpening = Math.min(...HOUSE.map(q => q.priceBp));
    for (const broker of BROKER_LIST) {
      expect(R.compare(reservationPrice(broker), priceValue(worstOpening)), broker.name).toBe(1);
    }
  });

  it('rises when a fee falls, at every broker', () => {
    // Monotonicity, checked rather than assumed: a cheaper look is worth having
    // at a higher price in hand.
    for (const broker of BROKER_LIST) {
      const cheaper = { ...broker, feeBp: Math.max(1, Math.floor(broker.feeBp / 2)) };
      expect(R.compare(reservationPrice(cheaper), reservationPrice(broker)), broker.name).toBe(1);
    }
  });
});

describe('the dynamic program', () => {
  it('reproduces the declared RTP exactly', () => {
    expect(solution.rtp.n).toBe(DECLARED_RTP_NUMERATOR);
    expect(solution.rtp.d).toBe(DECLARED_RTP_DENOMINATOR);
    expect(R.toPercent(solution.rtp, 4)).toBe('96.9637');
  });

  it('sits inside the jam band of 93–98%', () => {
    expect(R.compare(solution.rtp, R.rat(93n, 100n))).toBeGreaterThanOrEqual(0);
    expect(R.compare(solution.rtp, R.rat(98n, 100n))).toBeLessThanOrEqual(0);
  });

  it('every state is the best of taking and of each man left', () => {
    for (let mask = 0; mask < MASKS; mask++) {
      for (const price of PRICES) {
        if (!reachable(mask, price)) continue;
        const options = [takeValue(mask, price)];
        for (const broker of BROKER_LIST) {
          if (mask & (1 << broker.id)) continue;
          options.push(askValue(solution, mask, price, broker));
        }
        const best = options.reduce((a, b) => (R.compare(a, b) >= 0 ? a : b));
        const here = solution.value[mask]?.[PRICES.indexOf(price)];
        expect(here, `(${mask}, ${price})`).toBeDefined();
        expect(R.compare(here as R.Rational, best), `(${mask}, ${price})`).toBe(0);
      }
    }
  });

  it('is never worth less than selling right where you stand', () => {
    for (let mask = 0; mask < MASKS; mask++) {
      for (const price of PRICES) {
        if (!reachable(mask, price)) continue;
        const here = solution.value[mask]?.[PRICES.indexOf(price)] as R.Rational;
        expect(R.compare(here, takeValue(mask, price)), `(${mask}, ${price})`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a better price in hand is never worth less', () => {
    // Recall, as a monotonicity: holding more cannot hurt you.
    for (let mask = 0; mask < MASKS; mask++) {
      for (let i = 1; i < PRICES.length; i++) {
        const low = PRICES[i - 1] as number;
        const high = PRICES[i] as number;
        if (!reachable(mask, low) || !reachable(mask, high)) continue;
        const a = solution.value[mask]?.[i - 1] as R.Rational;
        const b = solution.value[mask]?.[i] as R.Rational;
        expect(R.compare(b, a), `${low} -> ${high} at mask ${mask}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("PANDORA'S RULE IS THE DYNAMIC PROGRAM", () => {
  it('makes the same choice at every reachable state', () => {
    // The theorem, checked rather than cited. Two men can be worth exactly the
    // same, so what must agree is the VALUE of the choice, not the name.
    for (let mask = 0; mask < MASKS; mask++) {
      for (const price of PRICES) {
        if (!reachable(mask, price)) continue;
        const dp = optimalChoice(solution, mask, price);
        const rule = pandora(mask, price);
        expect(dp === null, `stop/ask disagree at (${mask}, ${price})`).toBe(rule === null);
        if (dp && rule) {
          expect(R.compare(reservationPrice(dp), reservationPrice(rule)), `(${mask}, ${price})`).toBe(0);
        }
      }
    }
  });

  it('and returns exactly the same RTP', () => {
    expect(R.compare(evaluate(pandora), solution.rtp)).toBe(0);
  });

  it('which is what makes the printed rule the whole strategy', () => {
    // A player who reads the `?` panel can play this game exactly as well as the
    // dynamic program can. That is the point of publishing it.
    expect(R.toPercent(evaluate(pandora), 4)).toBe(R.toPercent(solution.rtp, 4));
  });
});

describe('I2 — the strategy band', () => {
  it('EVERY published policy lands inside 93–98%', () => {
    for (const entry of strategyBand(solution)) {
      const value = evaluate(entry.policy);
      expect(R.compare(value, R.rat(93n, 100n)), `${entry.label} is below the floor`).toBeGreaterThanOrEqual(0);
      expect(R.compare(value, R.rat(98n, 100n)), `${entry.label} is above the ceiling`).toBeLessThanOrEqual(0);
    }
  });

  it('no policy beats the DP', () => {
    for (const entry of strategyBand(solution)) {
      expect(R.compare(evaluate(entry.policy), solution.rtp), entry.label).toBeLessThanOrEqual(0);
    }
  });

  it('and the decision is worth something: asking everybody is measurably worse', () => {
    // A game whose optimal play and whose autopilot are a tenth of a point apart
    // is not a decision game. This one is three points apart.
    const band = Object.fromEntries(strategyBand(solution).map(entry => [entry.label, evaluate(entry.policy)]));
    const everybody = band['Ask everybody, then take the best'] as R.Rational;
    const gap = R.sub(solution.rtp, everybody);
    expect(R.compare(gap, R.rat(2n, 100n))).toBeGreaterThan(0);
  });

  it('the natural mistake — shopping in order of average price — costs more than a point', () => {
    const band = Object.fromEntries(strategyBand(solution).map(entry => [entry.label, evaluate(entry.policy)]));
    const byMean = band['Shop in order of average price'] as R.Rational;
    expect(R.compare(R.sub(solution.rtp, byMean), R.rat(1n, 100n))).toBeGreaterThan(0);
  });

  /**
   * The row exists to show what the ORDER alone costs, so it has to actually
   * shop. The policy it replaced stopped on the average rather than the index
   * and therefore asked nobody at all: it scored, to the digit, what never
   * shopping returns, under a label that called it a mistake.
   */
  it('and it is a different player from the one who never shops', () => {
    const band = Object.fromEntries(strategyBand(solution).map(entry => [entry.label, evaluate(entry.policy)]));
    const byMean = band['Shop in order of average price'] as R.Rational;
    const house = band['Take what the house names'] as R.Rational;
    expect(R.compare(byMean, house)).not.toBe(0);
    expect(R.toFixed(roundShape(askByMeanOrder()).meanAsked, 3)).not.toBe('0.000');
  });
});

describe('the one payout rule', () => {
  it('is what you hold, less what the day has cost', () => {
    const stake = 10n ** 18n;
    for (let mask = 0; mask < MASKS; mask++) {
      for (const price of PRICES) {
        const net = price - feesForMask(mask);
        const expected = net <= 0 ? 0n : (stake * BigInt(net)) / BigInt(PRICE_DENOM);
        expect(payoutBase(stake, price, feesForMask(mask))).toBe(expected);
      }
    }
  });

  it('the maximum is the best price less the one fee you must pay to hear it', () => {
    expect(R.compare(maximumPayout(), R.rat(MAX_PAYOUT_BP, PRICE_DENOM))).toBe(0);
    // Vanderdek is the only man who names 5.00x, so his fee is unavoidable.
    const jackpot = BROKER_LIST.find(b => b.quotes.some(q => q.priceBp === 50_000));
    expect(jackpot).toBeDefined();
    expect(MAX_PAYOUT_BP).toBe(50_000 - (jackpot?.feeBp ?? 0));
  });

  it('THERE IS NO LOSING STATE — the worst case still pays most of the stake', () => {
    // Every fee, and the house's lowest price: 0.703x. A player cannot lose
    // their stake in this game, let alone more than it (claude.md §7).
    const worst = takeValue(MASKS - 1, Math.min(...HOUSE.map(q => q.priceBp)));
    expect(R.compare(worst, R.ZERO)).toBe(1);
    expect(R.toFixed(worst, 4)).toBe('0.7030');
  });

  it('and the floor in the payout rule never actually binds', () => {
    // `payoutBase` floors at nothing, because it must; with this market the fees
    // can never reach the price in hand, and that is checked rather than assumed.
    const lowest = Math.min(...PRICES);
    expect(lowest).toBeGreaterThan(TOTAL_FEES_BP);
  });
});

describe('the shape of a round', () => {
  it('the optimal player asks between one and four men, and usually two', () => {
    const shape = roundShape(optimal);
    const total = shape.asked.reduce<R.Rational>((sum, p) => R.add(sum, p), R.ZERO);
    expect(R.compare(total, R.rat(1n))).toBe(0);
    expect(R.toFixed(shape.meanAsked, 2)).toBe('2.74');
    // Nobody sensible asks nobody: the house's price is never the best the DP
    // can do with a free look still on the table.
    expect(R.compare(shape.asked[0] as R.Rational, R.ZERO)).toBe(0);
  });

  it('the jackpot is reachable under optimal play, or it would be a lie to advertise it', () => {
    expect(R.compare(probabilityAtLeast(optimal, R.rat(4n)), R.ZERO)).toBe(1);
  });
});

describe('I11 — the generated Solidity mirror', () => {
  const solidity = readFileSync(new URL('../contracts/generated/Market.sol', import.meta.url), 'utf8');
  const u = (n: number | bigint) => n.toLocaleString('en-US').replace(/,/g, '_');

  it('is marked generated, so nobody hand-edits it', () => {
    expect(solidity).toContain('GENERATED FILE — DO NOT EDIT');
  });

  it('carries every fee', () => {
    for (const broker of BROKER_LIST) {
      expect(solidity, broker.name).toContain(`if (id == ${broker.id}) return ${u(broker.feeBp)}; // ${broker.name}`);
    }
  });

  it('carries every quote table, at the same cumulative boundaries', () => {
    for (const broker of BROKER_LIST) {
      let cumulative = 0;
      for (const [i, quote] of broker.quotes.entries()) {
        cumulative += quote.weight;
        if (i === broker.quotes.length - 1) continue;
        expect(solidity, `${broker.name} ${quote.priceBp}`).toContain(`if (r < ${u(cumulative)}) return ${u(quote.priceBp)};`);
      }
    }
  });

  it('carries the declared RTP and the true maximum payout', () => {
    expect(solidity).toContain(`RTP_NUM = ${u(DECLARED_RTP_NUMERATOR)}`);
    expect(solidity).toContain(`RTP_DEN = ${u(DECLARED_RTP_DENOMINATOR)}`);
    expect(solidity).toContain(`MAX_PAYOUT_BP = ${u(MAX_PAYOUT_BP)}`);
  });

  it('and the contract quotes that RTP to the vault', () => {
    const game = readFileSync(new URL('../contracts/Brokers.sol', import.meta.url), 'utf8');
    expect(game).toContain('(wager * BrokerMarket.RTP_NUM) / BrokerMarket.RTP_DEN');
    expect(game).toContain('BrokerMarket.MAX_PAYOUT_BP');
  });

  it('the contract never uses a bare modulo of a word', () => {
    const game = readFileSync(new URL('../contracts/Brokers.sol', import.meta.url), 'utf8');
    expect(game).toContain('RNG_LIMIT');
    const modulos = game.match(/%\s*BrokerMarket\.\w+/g) ?? [];
    for (const modulo of modulos) expect(modulo).toBe('% BrokerMarket.WEIGHT_DENOM');
  });
});
