/**
 * I3 for THE SURVEY — randomness is drawn by **rejection sampling**, never
 * `word % n`, and the belief thresholds are compared exactly.
 *
 * The sharp end here is not uniformity for its own sake. It is that the reports
 * a player sees must come out of the PREDICTIVE distribution and her condition
 * out of the POSTERIOR — if either drifted, the client would be animating a
 * different game from the one that settles, and the fog would be a lie.
 *
 * And the generative order, which is the whole security model: the condition is
 * drawn from a word requested only after the call is committed. There is no
 * arrangement of the state in which it could have been read earlier, because at
 * that point nothing had decided it.
 */
import { describe, it, expect } from 'vitest';
import { keccak256 } from 'viem';
import { readFileSync } from 'node:fs';
import { drawCargo, drawReport, drawReportGiven, drawCondition, drawFine, DRAW_SPACE } from '../src/games/survey/core/draw';
import { CARGOES, WEIGHT_DENOM, MAX_SURVEYS, cargoForDraw } from '../src/games/survey/core/vessel';
import { accuracy, posteriorSound, predictiveSound } from '../src/games/survey/core/belief';
import { wordToBytes, wordFromBytes, MAX_REHASHES, type Rehash } from '../src/shared/rng';
import * as R from '../src/shared/math/rational';

/** The same rehash the contract uses: keccak256 over the raw 32 bytes. */
const rehash: Rehash = w => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(w)))));

/** A deterministic stream of words, so every count here is reproducible. */
function* words(seed: bigint): Generator<bigint> {
  let word = seed;
  for (;;) {
    word = BigInt(keccak256(wordToBytes(word)));
    yield word;
  }
}

describe('the fine draw', () => {
  it('lands inside [0, DRAW_SPACE), always', () => {
    const stream = words(1728n);
    for (let i = 0; i < 4_000; i++) {
      const { value } = drawFine(stream.next().value, 0, rehash);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(DRAW_SPACE);
    }
  });

  it('is uniform to within 5 sigma over a million parts', () => {
    // Ten buckets, 20,000 draws. Under uniformity each holds 2,000 with a
    // standard deviation of sqrt(20000 * 0.1 * 0.9) ~ 42.4.
    const N = 20_000;
    const buckets = new Array<number>(10).fill(0);
    const stream = words(99n);
    for (let i = 0; i < N; i++) {
      const { value } = drawFine(stream.next().value, 0, rehash);
      const bucket = Math.floor((value / DRAW_SPACE) * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expected = N / 10;
    const sigma = Math.sqrt(N * 0.1 * 0.9);
    for (const [i, count] of buckets.entries()) {
      expect(Math.abs(count - expected), `bucket ${i} held ${count}`).toBeLessThan(5 * sigma);
    }
  });

  it('never reads past the end of a word without rehashing', () => {
    // A cursor at the very last window must still produce a value: the draw
    // needs two windows, so it has to cross into a fresh word cleanly.
    const stream = words(7n);
    for (let i = 0; i < 200; i++) {
      const { value } = drawFine(stream.next().value, 15, rehash);
      expect(value).toBeLessThan(DRAW_SPACE);
    }
  });

  it('gives up loudly rather than looping forever', () => {
    // claude.md §3 forbids unbounded loops. A word of all ones rejects every
    // window, and a rehash that hands back the same word would spin forever;
    // the draw gives up after the same bounded number of tries the contract
    // allows, and says so.
    const allOnes = (1n << 256n) - 1n;
    const stuck: Rehash = w => w;
    expect(() => drawFine(allOnes, 0, stuck)).toThrow(/exhausted/);
  });

  it('but a healthy rehash gets it out of that hole', () => {
    // The same impossible word, with the real keccak rehash: the very next word
    // is ordinary and the draw completes.
    const allOnes = (1n << 256n) - 1n;
    const { value } = drawFine(allOnes, 0, rehash);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(DRAW_SPACE);
  });
});

describe('the manifest draw', () => {
  it('only ever produces a cargo on the manifest', () => {
    const stream = words(4n);
    const seen = new Set<number>();
    for (let i = 0; i < 3_000; i++) {
      const { cargo } = drawCargo(stream.next().value, 0, rehash);
      seen.add(cargo.valueBp);
    }
    for (const value of seen) expect(CARGOES.some(c => c.valueBp === value), `${value} is not on the manifest`).toBe(true);
  });

  it('follows the published weights to within 5 sigma', () => {
    const N = 20_000;
    const counts = new Map<number, number>();
    const stream = words(1_066n);
    for (let i = 0; i < N; i++) {
      const { cargo } = drawCargo(stream.next().value, 0, rehash);
      counts.set(cargo.id, (counts.get(cargo.id) ?? 0) + 1);
    }
    for (const cargo of CARGOES) {
      const p = cargo.weight / WEIGHT_DENOM;
      const expected = N * p;
      const sigma = Math.sqrt(N * p * (1 - p));
      const seen = counts.get(cargo.id) ?? 0;
      expect(Math.abs(seen - expected), `${cargo.name}: ${seen} of ${N}`).toBeLessThan(5 * sigma);
    }
  });

  it('maps the boundaries of the weight table exactly', () => {
    // Every cumulative boundary, from both sides. An off-by-one here would move
    // real probability between cargoes and nothing would visibly break.
    let cumulative = 0;
    for (const cargo of CARGOES) {
      expect(cargoForDraw(cumulative).id, `first draw of ${cargo.name}`).toBe(cargo.id);
      cumulative += cargo.weight;
      expect(cargoForDraw(cumulative - 1).id, `last draw of ${cargo.name}`).toBe(cargo.id);
    }
    expect(cumulative).toBe(WEIGHT_DENOM);
    expect(() => cargoForDraw(WEIGHT_DENOM)).toThrow(RangeError);
    expect(() => cargoForDraw(-1)).toThrow(RangeError);
  });
});

describe('the reports come from the predictive distribution', () => {
  it('at every reachable margin, to within 5 sigma', () => {
    const N = 6_000;
    for (let margin = -MAX_SURVEYS; margin <= MAX_SURVEYS; margin++) {
      const p = R.toNumber(predictiveSound(margin));
      let sound = 0;
      const stream = words(BigInt(500 + margin));
      for (let i = 0; i < N; i++) {
        if (drawReport(margin, stream.next().value, 0, rehash).report === 'SOUND') sound++;
      }
      const sigma = Math.sqrt(N * p * (1 - p));
      expect(Math.abs(sound - N * p), `margin ${margin}: ${sound} sound of ${N}, expected ~${(N * p).toFixed(0)}`).toBeLessThan(
        5 * sigma,
      );
    }
  });

  it('and the same word always gives the same report', () => {
    const stream = words(31n);
    for (let i = 0; i < 100; i++) {
      const word = stream.next().value;
      expect(drawReport(0, word, 0, rehash).report).toBe(drawReport(0, word, 0, rehash).report);
    }
  });
});

describe('her condition comes from the posterior', () => {
  it('at every reachable margin, to within 5 sigma', () => {
    const N = 6_000;
    for (let margin = -MAX_SURVEYS; margin <= MAX_SURVEYS; margin++) {
      const p = R.toNumber(posteriorSound(margin));
      let sound = 0;
      const stream = words(BigInt(900 + margin));
      for (let i = 0; i < N; i++) {
        if (drawCondition(margin, stream.next().value, 0, rehash).isSound) sound++;
      }
      const sigma = Math.sqrt(N * p * (1 - p));
      expect(Math.abs(sound - N * p), `margin ${margin}: ${sound} sound of ${N}`).toBeLessThan(5 * sigma);
    }
  });

  it('the joint model is consistent: predictive = posterior smeared by accuracy', () => {
    // The contract factors the model the other way round from the obvious one
    // (see `core/draw.ts`). This is the identity that makes the two orders the
    // same distribution, checked exactly rather than sampled.
    for (let margin = -MAX_SURVEYS; margin <= MAX_SURVEYS; margin++) {
      const p = posteriorSound(margin);
      const q = R.rat(3n, 5n); // the surveyor's accuracy, as vessel.ts declares it
      const expected = R.add(R.mul(p, q), R.mul(R.sub(R.rat(1n), p), R.sub(R.rat(1n), q)));
      expect(R.compare(predictiveSound(margin), expected), `margin ${margin}`).toBe(0);
    }
  });

  it('a margin that says rot almost never comes home', () => {
    // A sanity check on the direction of the whole thing: at the deepest belief
    // in rot she is sound about 8% of the time, not 92%.
    const N = 2_000;
    let sound = 0;
    const stream = words(77n);
    for (let i = 0; i < N; i++) if (drawCondition(-MAX_SURVEYS, stream.next().value, 0, rehash).isSound) sound++;
    expect(sound / N).toBeLessThan(0.15);
  });
});

describe('the bound the contract also carries', () => {
  it('the rehash cap is the same number in both languages', () => {
    const solidity = readFileSync(new URL('../contracts/Survey.sol', import.meta.url), 'utf8');
    const declared = /MAX_REHASHES\s*=\s*(\d+)/.exec(solidity)?.[1];
    expect(declared, 'Survey.sol declares a rehash cap').toBeDefined();
    expect(Number(declared), 'and it is the same bound as the TS mirror').toBe(MAX_REHASHES);
  });

  it('the contract draws by rejection, never by a bare modulo of a word', () => {
    const solidity = readFileSync(new URL('../contracts/Survey.sol', import.meta.url), 'utf8');
    expect(solidity, 'the manifest draw rejects above the limit').toContain('RNG_LIMIT');
    expect(solidity, 'the fine draw rejects above its own limit').toContain('FINE_LIMIT');
    // The only modulos in the file are the ones applied AFTER a rejection test.
    const modulos = solidity.match(/%\s*SurveyManifest\.\w+/g) ?? [];
    for (const modulo of modulos) {
      expect(['% SurveyManifest.WEIGHT_DENOM', '% SurveyManifest.DRAW_SPACE']).toContain(modulo);
    }
  });

  it('and compares every threshold by cross-multiplication, never by a rounded constant', () => {
    const solidity = readFileSync(new URL('../contracts/Survey.sol', import.meta.url), 'utf8');
    expect(solidity).toContain('drawn * d < n * SurveyManifest.DRAW_SPACE');
  });
});

/**
 * The Ghost Report is the one draw that happens AFTER the voyage has a truth,
 * and it has to be a reading of that truth rather than another draw from a
 * belief the settlement has already retired.
 *
 * The demo host drew it from the predictive distribution in both cases, which
 * left the ghost independent of the outcome the player had just watched. It
 * moved no money; it made the one game in the room that sells coherent belief
 * the one place a patient player could catch it being incoherent.
 */
describe('the ghost, once she has been resolved', () => {
  const N = 20_000;

  it('agrees with a sound ship exactly as often as a surveyor is right', () => {
    const stream = words(4_242n);
    let sound = 0;
    for (let i = 0; i < N; i++) if (drawReportGiven(true, stream.next().value, 0, rehash).report === 'SOUND') sound++;
    expect(Math.abs(sound / N - R.toNumber(accuracy()))).toBeLessThan(0.02);
  });

  it('and calls a rotten ship sound only as often as he is wrong', () => {
    const stream = words(4_243n);
    let sound = 0;
    for (let i = 0; i < N; i++) if (drawReportGiven(false, stream.next().value, 0, rehash).report === 'SOUND') sound++;
    expect(Math.abs(sound / N - (1 - R.toNumber(accuracy())))).toBeLessThan(0.02);
  });

  it('which is NOT what the predictive draw would have said at the same margin', () => {
    // The gap is the whole bug: at the prior the predictive draw says SOUND
    // 48% of the time whatever she turned out to be, and a surveyor reading a
    // sound ship says it 60% of the time.
    expect(R.compare(predictiveSound(0), accuracy())).not.toBe(0);
  });
});
