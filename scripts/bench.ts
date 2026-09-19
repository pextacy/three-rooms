/**
 * `npm run bench` — the Monte Carlo gate (docs.md §7).
 *
 * Two questions the closed form cannot answer on its own:
 *   1. does the rejection sampler actually produce a uniform stream at scale?
 *   2. do simulated rounds under optimal play land on the declared RTP?
 *
 * The words come from a fast xoshiro-style PRNG rather than keccak — the VRF is
 * not what is under test here, the MAPPING is, and every word still goes
 * through the real `draw()` in src/shared/rng.ts.
 *
 *   npm run bench                # 10^7 draws, 10^7 rounds
 *   BENCH_N=1000000 npm run bench
 */
import { draw, type Rehash } from '../src/shared/rng';
import { LOTS, WEIGHT_DENOM, lotForDraw } from '../src/games/candle/core/paytable';
import { INCHES, waxBpAt } from '../src/games/candle/core/wax';
import { solve, optimalPolicy, probabilityAtLeast, probabilityOfNothing, meanRoundLength, standardDeviation } from '../src/games/candle/core/solve';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, VALUE_DENOM, premiumBpAt } from '../src/games/survey/core/vessel';
import { drawReport, drawCondition, drawCargo } from '../src/games/survey/core/draw';
import { predictiveSound } from '../src/games/survey/core/belief';
import {
  solve as solveSurvey,
  optimalPolicy as surveyOptimal,
  bestCall as surveyBestCall,
  meanSurveys,
  cargoProbability,
} from '../src/games/survey/core/solve';
import {
  BROKER_LIST as MARKET,
  HOUSE as HOUSE_QUOTES,
  WEIGHT_DENOM as BROKER_WEIGHT_DENOM,
  PRICE_DENOM as BROKER_PRICE_DENOM,
  feesForMask,
  payoutBase,
} from '../src/games/brokers/core/market';
import { drawHousePrice, drawQuote } from '../src/games/brokers/core/draw';
import {
  solve as solveBrokers,
  optimalPolicy as brokersOptimal,
  roundShape,
  probabilityAtLeast as brokersProbabilityAtLeast,
} from '../src/games/brokers/core/solve';
import * as R from '../src/shared/math/rational';

const N = Number(process.env['BENCH_N'] ?? 10_000_000);
/**
 * THE SURVEY's rounds cost several draws each — a manifest, a report per
 * surveyor and her condition — so the same wall-clock budget buys a tenth as
 * many voyages. Still 10^6, which bounds every reachable margin to five sigma.
 */
const SURVEY_N = Number(process.env['BENCH_SURVEY_N'] ?? Math.max(Math.floor(N / 10), 1_000));
/**
 * THE BROKERS costs at most five draws a round — the house, and one a broker —
 * and its payout is bounded by 4.99x, so the same tenth of the budget bounds it
 * far tighter than THE SURVEY's 20x cargo does.
 */
const BROKERS_N = Number(process.env['BENCH_BROKERS_N'] ?? Math.max(Math.floor(N / 10), 1_000));
const MASK = (1n << 256n) - 1n;

/** A cheap 256-bit stream. Deterministic, so a failure is reproducible. */
function makeStream(seed: bigint): () => bigint {
  let s = seed | 1n;
  return () => {
    // 64-bit xorshift lifted to 256 bits by chaining four rounds.
    let out = 0n;
    for (let i = 0; i < 4; i++) {
      s ^= (s << 13n) & 0xffffffffffffffffn;
      s ^= s >> 7n;
      s ^= (s << 17n) & 0xffffffffffffffffn;
      s &= 0xffffffffffffffffn;
      out = (out << 64n) | s;
    }
    return out & MASK;
  };
}

/** How many brokers a mask has been spent on. */
function popcount32(mask: number): number {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n += 1;
  return n;
}

/** The bench never exhausts 16 windows, but the path must still be total. */
const rehash: Rehash = w => (w * 6364136223846793005n + 1442695040888963407n) & MASK;

const solution = solve();
const optimal = optimalPolicy(solution);
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

console.log(`\n${B('CANDLE — Monte Carlo')}`);
console.log(D(`${N.toLocaleString('en-US')} draws and ${N.toLocaleString('en-US')} rounds\n`));

// ---------------------------------------------------------------- uniformity
console.log(B('Uniformity of the rejection sampler'));
{
  const BUCKETS = 100;
  const width = WEIGHT_DENOM / BUCKETS;
  const counts = new Float64Array(BUCKETS);
  const lotCounts = new Float64Array(LOTS.length);
  const next = makeStream(0x1728n);
  const started = Date.now();

  for (let i = 0; i < N; i++) {
    const v = draw(next(), 0, rehash).value;
    counts[Math.floor(v / width)]! += 1;
    lotCounts[lotForDraw(v).id]! += 1;
  }

  const expected = N / BUCKETS;
  let chi = 0;
  for (const c of counts) chi += (c - expected) ** 2 / expected;
  // 99.9th percentile of chi-square with 99 df.
  const CRITICAL = 148.2;
  check(`chi-square over ${BUCKETS} buckets is below ${CRITICAL}`, chi < CRITICAL, `${chi.toFixed(2)} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  for (const lot of LOTS) {
    const observed = lotCounts[lot.id]! / N;
    const want = lot.weight / WEIGHT_DENOM;
    // 5 sigma on a binomial, floored so the rarest lot still gets a real bound.
    const sigma = Math.sqrt((want * (1 - want)) / N);
    const tolerance = Math.max(5 * sigma, 1e-6);
    check(
      `${lot.name} lands on ${(want * 100).toFixed(2)}%`,
      Math.abs(observed - want) < tolerance,
      `observed ${(observed * 100).toFixed(4)}%, tolerance ±${(tolerance * 100).toFixed(4)}pp`,
    );
  }
}

// ---------------------------------------------------------------- rounds
console.log(`\n${B('Simulated rounds under optimal play')}`);
{
  const next = makeStream(0xca4d1e5n);
  const started = Date.now();
  let total = 0;
  let inches = 0;
  let zeros = 0;
  let atLeastOne = 0;
  let jackpots = 0;
  let secondMoment = 0;

  for (let i = 0; i < N; i++) {
    for (let inch = 1; inch <= INCHES; inch++) {
      const lot = lotForDraw(draw(next(), 0, rehash).value);
      const forced = inch === INCHES;
      if (forced || optimal(lot, inch)) {
        const payout = (lot.faceBp * waxBpAt(inch)) / 1_000_000;
        total += payout;
        secondMoment += payout * payout;
        inches += inch;
        if (payout === 0) zeros++;
        if (payout >= 1) atLeastOne++;
        if (payout >= 25) jackpots++;
        break;
      }
    }
  }

  const meanRtp = total / N;
  const declared = R.toNumber(solution.rtp);
  // Standard error of the mean payout; 1.7568 sd / sqrt(N), times 5.
  const tolerance = Math.max((5 * 1.7568) / Math.sqrt(N), 1e-9);
  check(
    'mean payout lands on the declared RTP',
    Math.abs(meanRtp - declared) < tolerance,
    `${(meanRtp * 100).toFixed(4)}% vs ${(declared * 100).toFixed(4)}%, tolerance ±${(tolerance * 100).toFixed(4)}pp (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );

  const compare = (label: string, observed: number, exact: R.Rational, sigmas = 5) => {
    const want = R.toNumber(exact);
    const tol = Math.max(sigmas * Math.sqrt((want * (1 - want)) / N), 1e-6);
    check(label, Math.abs(observed - want) < tol, `observed ${(observed * 100).toFixed(4)}%, closed form ${(want * 100).toFixed(4)}%`);
  };

  compare('P(payout = 0)', zeros / N, probabilityOfNothing(optimal));
  compare('P(payout >= 1x)', atLeastOne / N, probabilityAtLeast(optimal, R.rat(1n)));
  compare('P(payout = 25x)', jackpots / N, probabilityAtLeast(optimal, R.rat(25n)));

  const meanInches = inches / N;
  const exactInches = R.toNumber(meanRoundLength(optimal));
  check('mean round length', Math.abs(meanInches - exactInches) < 0.01, `${meanInches.toFixed(4)} vs ${exactInches.toFixed(4)} inches`);

  const sd = Math.sqrt(Math.max(secondMoment / N - meanRtp ** 2, 0));
  const exactSd = standardDeviation(optimal);
  check('standard deviation', Math.abs(sd - exactSd) < 0.05, `${sd.toFixed(4)} vs ${exactSd.toFixed(4)}`);
}

// ---------------------------------------------------------------- the survey
/**
 * THE SURVEY, simulated end to end — and the point of doing it at all is the
 * REVERSED GENERATIVE ORDER (see `core/draw.ts`). Reports are drawn from the
 * predictive distribution as they are asked for and her condition only at
 * settlement, from the posterior. That is a different factorisation of the joint
 * model from the obvious one, and "it is the same distribution" is a claim worth
 * checking against ${SURVEY_N.toLocaleString('en-US')} voyages rather than asserting.
 */
console.log(`\n${B('THE SURVEY — Monte Carlo')}`);
console.log(D(`${SURVEY_N.toLocaleString('en-US')} voyages under optimal play\n`));
{
  const survey = solveSurvey();
  const optimalSurvey = surveyOptimal(survey);
  const next = makeStream(0x5175e7n);
  const started = Date.now();

  let total = 0;
  let secondMoment = 0;
  let surveysBought = 0;
  let underwritten = 0;
  let cameHomeWhenUnderwritten = 0;
  let zeros = 0;
  const cargoCounts = new Float64Array(CARGOES.length);
  /** Every report ever drawn, by the margin it was drawn at: the predictive check. */
  const soundAt = new Map<number, number>();
  const drawsAt = new Map<number, number>();

  for (let i = 0; i < SURVEY_N; i++) {
    const cargo = drawCargo(next(), 0, rehash).cargo;
    cargoCounts[cargo.id]! += 1;

    let margin = 0;
    let k = 0;
    while (k < MAX_SURVEYS && optimalSurvey(cargo, k, margin)) {
      drawsAt.set(margin, (drawsAt.get(margin) ?? 0) + 1);
      const report = drawReport(margin, next(), 0, rehash).report;
      if (report === 'SOUND') {
        soundAt.set(margin, (soundAt.get(margin) ?? 0) + 1);
        margin += 1;
      } else {
        margin -= 1;
      }
      k += 1;
    }
    surveysBought += k;

    const premium = premiumBpAt(k) / 10_000;
    let payout: number;
    if (surveyBestCall(cargo, k, margin).call === 'DECLINE') {
      payout = (DECLINE_BP / VALUE_DENOM) * premium;
    } else {
      underwritten += 1;
      // THE word that decides her, drawn only now — after the call is fixed.
      const sound = drawCondition(margin, next(), 0, rehash).isSound;
      if (sound) {
        cameHomeWhenUnderwritten += 1;
        payout = (cargo.valueBp / VALUE_DENOM) * premium;
      } else {
        zeros += 1;
        payout = 0;
      }
    }
    total += payout;
    secondMoment += payout * payout;
  }

  const meanRtp = total / SURVEY_N;
  const declared = R.toNumber(survey.rtp);
  // The tolerance comes from the OBSERVED spread rather than a guess at it: the
  // 20x cargo makes this distribution heavy enough that a made-up sigma would
  // either pass anything or fail on a good run.
  const sd = Math.sqrt(Math.max(secondMoment / SURVEY_N - meanRtp ** 2, 0));
  const tolerance = Math.max((5 * sd) / Math.sqrt(SURVEY_N), 0.0005);
  check(
    'simulated RTP lands on the declared RTP',
    Math.abs(meanRtp - declared) < tolerance,
    `${(meanRtp * 100).toFixed(4)}% vs ${(declared * 100).toFixed(4)}%, tolerance ±${(tolerance * 100).toFixed(4)}pp, sd ${sd.toFixed(3)} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );

  const meanK = surveysBought / SURVEY_N;
  const exactK = R.toNumber(meanSurveys(optimalSurvey));
  check('mean surveyors bought', Math.abs(meanK - exactK) < 0.02, `${meanK.toFixed(4)} vs ${exactK.toFixed(4)}`);

  for (const cargo of CARGOES) {
    const observed = cargoCounts[cargo.id]! / SURVEY_N;
    const want = R.toNumber(cargoProbability(cargo));
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / SURVEY_N), 1e-5);
    check(
      `${cargo.name} lands on ${(want * 100).toFixed(2)}%`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(4)}%`,
    );
  }

  console.log(`\n${B('The reports really do come from the predictive distribution')}`);
  for (const [margin, n] of [...drawsAt.entries()].sort((a, b) => a[0] - b[0])) {
    if (n < 1_000) continue; // too few to bound meaningfully
    const observed = (soundAt.get(margin) ?? 0) / n;
    const want = R.toNumber(predictiveSound(margin));
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / n), 1e-4);
    check(
      `margin ${margin >= 0 ? `+${margin}` : margin}: P(next says SOUND) = ${(want * 100).toFixed(2)}%`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(2)}% over ${n.toLocaleString('en-US')} reports`,
    );
  }

  console.log(`\n${B('And she is sound exactly as often as the posterior says')}`);
  const pSoundOverall = cameHomeWhenUnderwritten / Math.max(underwritten, 1);
  console.log(
    D(
      `  ${underwritten.toLocaleString('en-US')} voyages underwritten, ${cameHomeWhenUnderwritten.toLocaleString('en-US')} came home ` +
        `(${(pSoundOverall * 100).toFixed(2)}%), ${zeros.toLocaleString('en-US')} paid nothing`,
    ),
  );
  check(
    'a voyage is only ever underwritten when the evidence says she is likelier sound than not',
    pSoundOverall > 0.5,
    'the DP never takes a risk it believes against',
  );
}

// ------------------------------------------------------------- THE BROKERS
console.log(`\n${B('THE BROKERS — the day on the floor, dealt for real')}`);
console.log(
  D(
    `  ${BROKERS_N.toLocaleString('en-US')} rounds under Pandora's rule: the house opens, the index picks who to`,
  ),
);
console.log(D('  ask next, and the fees come out of whatever the best price turns out to be.'));
{
  const brokers = solveBrokers();
  const policy = brokersOptimal(brokers);
  const shape = roundShape(policy);
  const next = makeStream(0xb204e25n);
  const started = Date.now();

  /** The stake, in base units. A round pays `payoutBase` of it, exactly as the contract does. */
  const STAKE = 1_000_000_000_000n;
  let totalPaid = 0n;
  let secondMoment = 0;
  let asked = 0;
  const askedCounts = new Float64Array(MARKET.length + 1);
  let keptTheHouse = 0;
  let atLeastDouble = 0;
  const housePrices = new Map<number, number>();
  const quotePrices = MARKET.map(() => new Map<number, number>());
  const timesAsked = new Float64Array(MARKET.length);

  for (let i = 0; i < BROKERS_N; i++) {
    const opening = drawHousePrice(next(), 0, rehash);
    const housePrice = opening.priceBp;
    housePrices.set(housePrice, (housePrices.get(housePrice) ?? 0) + 1);

    let mask = 0;
    let best = housePrice;
    for (;;) {
      const choice = policy(mask, best);
      if (choice === null || mask & (1 << choice.id)) break;
      timesAsked[choice.id]! += 1;
      const quote = drawQuote(choice.id, next(), 0, rehash);
      quotePrices[choice.id]!.set(quote.priceBp, (quotePrices[choice.id]!.get(quote.priceBp) ?? 0) + 1);
      mask |= 1 << choice.id;
      if (quote.priceBp > best) best = quote.priceBp;
    }

    const k = popcount32(mask);
    asked += k;
    askedCounts[k]! += 1;
    if (best === housePrice) keptTheHouse += 1;

    const paid = payoutBase(STAKE, best, feesForMask(mask));
    totalPaid += paid;
    const asMultiple = Number(paid) / Number(STAKE);
    if (asMultiple >= 2) atLeastDouble += 1;
    secondMoment += asMultiple * asMultiple;
  }

  const meanRtp = Number(totalPaid) / Number(STAKE * BigInt(BROKERS_N));
  const declared = R.toNumber(brokers.rtp);
  const sd = Math.sqrt(Math.max(secondMoment / BROKERS_N - meanRtp ** 2, 0));
  const tolerance = Math.max((5 * sd) / Math.sqrt(BROKERS_N), 0.0002);
  check(
    'simulated RTP lands on the declared RTP',
    Math.abs(meanRtp - declared) < tolerance,
    `${(meanRtp * 100).toFixed(4)}% vs ${(declared * 100).toFixed(4)}%, tolerance ±${(tolerance * 100).toFixed(4)}pp, sd ${sd.toFixed(3)} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );

  const meanAsked = asked / BROKERS_N;
  const exactAsked = R.toNumber(shape.meanAsked);
  check(
    'mean brokers asked',
    Math.abs(meanAsked - exactAsked) < 0.02,
    `${meanAsked.toFixed(4)} vs ${exactAsked.toFixed(4)}`,
  );

  for (let k = 0; k <= MARKET.length; k++) {
    const want = R.toNumber(shape.asked[k] ?? R.ZERO);
    if (want === 0) continue;
    const observed = askedCounts[k]! / BROKERS_N;
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / BROKERS_N), 1e-4);
    check(
      `${k} asked in ${(want * 100).toFixed(2)}% of rounds`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(4)}%`,
    );
  }

  {
    const want = R.toNumber(shape.keptTheHouse);
    const observed = keptTheHouse / BROKERS_N;
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / BROKERS_N), 1e-4);
    check(
      `nobody beats the house's own price in ${(want * 100).toFixed(2)}% of rounds`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(4)}%`,
    );
  }

  {
    const want = R.toNumber(brokersProbabilityAtLeast(policy, R.rat(2n)));
    const observed = atLeastDouble / BROKERS_N;
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / BROKERS_N), 1e-4);
    check(
      `the round doubles the stake ${(want * 100).toFixed(2)}% of the time`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(4)}%`,
    );
  }

  console.log(`\n${B('And every man on the floor names his prices as often as the sheet says')}`);
  const houseTotal = BROKERS_N;
  for (const quote of HOUSE_QUOTES) {
    const want = quote.weight / BROKER_WEIGHT_DENOM;
    const observed = (housePrices.get(quote.priceBp) ?? 0) / houseTotal;
    const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / houseTotal), 1e-4);
    check(
      `the house at ${(quote.priceBp / BROKER_PRICE_DENOM).toFixed(2)}×: ${(want * 100).toFixed(2)}%`,
      Math.abs(observed - want) < tol,
      `observed ${(observed * 100).toFixed(4)}% over ${houseTotal.toLocaleString('en-US')} openings`,
    );
  }
  for (const broker of MARKET) {
    const n = timesAsked[broker.id]!;
    if (n < 1_000) {
      console.log(D(`  ${broker.name} was asked ${n.toLocaleString('en-US')} times — too few to bound`));
      continue;
    }
    for (const quote of broker.quotes) {
      const want = quote.weight / BROKER_WEIGHT_DENOM;
      const observed = (quotePrices[broker.id]!.get(quote.priceBp) ?? 0) / n;
      const tol = Math.max(5 * Math.sqrt((want * (1 - want)) / n), 1e-4);
      check(
        `${broker.name} at ${(quote.priceBp / BROKER_PRICE_DENOM).toFixed(2)}×: ${(want * 100).toFixed(2)}%`,
        Math.abs(observed - want) < tol,
        `observed ${(observed * 100).toFixed(4)}% over ${n.toLocaleString('en-US')} asks`,
      );
    }
  }
}

console.log(`\n${failed === 0 ? '\x1b[32mBENCH GREEN\x1b[0m' : '\x1b[31mBENCH RED\x1b[0m'}  ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
