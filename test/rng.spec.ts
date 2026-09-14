/**
 * I3 — randomness is drawn by rejection sampling, never `word % n`.
 *
 * The chi-square run is the headline, but the sharper test is the bias one: it
 * shows the naive modulo FAILS the same check, so the gate has teeth.
 */
import { describe, it, expect } from 'vitest';
import { keccak256 } from 'viem';
import { draw, drawLot, wordFromHex, wordToHex, wordToBytes, wordFromBytes, RNG_LIMIT, WINDOWS, REHASH_UNSUPPORTED, type Rehash } from '../src/game/rng';
import { WEIGHT_DENOM, LOTS, CUMULATIVE_WEIGHTS, lotForDraw } from '../src/game/paytable';

/** The contract's rehash: keccak256 over the raw 32 bytes. */
const keccakRehash: Rehash = word => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(word)))));

/** A cheap deterministic word stream. Not the game's randomness — test fuel. */
function* words(seed: bigint): Generator<bigint> {
  let w = seed;
  for (;;) {
    w = BigInt(keccak256(wordToBytes(w)));
    yield w;
  }
}

describe('rejection sampling', () => {
  it('rejects exactly the windows at or above 60000', () => {
    expect(RNG_LIMIT).toBe(60_000);
    expect(RNG_LIMIT % WEIGHT_DENOM).toBe(0);
    expect(RNG_LIMIT).toBe(Math.floor(65_536 / WEIGHT_DENOM) * WEIGHT_DENOM);
  });

  it('reads 16-bit windows most-significant first', () => {
    // Top window 0x0001 -> value 1; the rest of the word must not matter.
    const word = (1n << 240n) | 0xdeadbeefn;
    expect(draw(word).value).toBe(1);
  });

  it('skips a rejected leading window and takes the next', () => {
    // First window 0xFFFF (65535 >= 60000, rejected), second 0x0007.
    const word = (0xffffn << 240n) | (7n << 224n);
    const result = draw(word);
    expect(result.value).toBe(7);
    expect(result.rejected).toBe(1);
    expect(result.cursor).toBe(2);
  });

  it('returns values only in [0, 10000)', () => {
    let i = 0;
    for (const w of words(1n)) {
      const v = draw(w, 0, keccakRehash).value;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(WEIGHT_DENOM);
      if (++i >= 20_000) break;
    }
  });

  it('rehashes rather than reverting when all 16 windows are rejected', () => {
    // Every window 0xFFFF: all sixteen rejected, so it must fall through.
    const exhausted = (1n << 256n) - 1n;
    expect(() => draw(exhausted, 0, REHASH_UNSUPPORTED)).toThrow(/rehash/);
    const result = draw(exhausted, 0, keccakRehash);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThan(WEIGHT_DENOM);
    expect(result.rejected).toBe(WINDOWS);
    expect(result.word).not.toBe(exhausted);
  });

  it('threads the cursor so a second draw from one word is independent', () => {
    const word = wordFromHex('0x0001000200030004000500060007000800090010001100120013001400150016');
    const first = draw(word, 0);
    const second = draw(first.word, first.cursor);
    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
  });

  it('rejects malformed inputs rather than coercing them', () => {
    expect(() => draw(-1n)).toThrow(RangeError);
    expect(() => draw(1n << 256n)).toThrow(RangeError);
    expect(() => draw(1n, -1)).toThrow(RangeError);
    expect(() => draw(1n, 1.5)).toThrow(RangeError);
  });
});

describe('I3 — uniformity, and that the naive modulo would fail', () => {
  const DRAWS = 1_000_000;
  const BUCKETS = 100; // 10000 / 100, so each bucket holds 100 consecutive values

  /** Pearson chi-square over `BUCKETS` equiprobable buckets. */
  const chiSquare = (counts: number[], total: number) => {
    const expected = total / BUCKETS;
    return counts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
  };

  // 99.9th percentile of chi-square with 99 degrees of freedom is ~148.2.
  const CRITICAL = 148.2;

  it(`is uniform over ${DRAWS.toLocaleString('en-US')} draws`, () => {
    const counts = new Array<number>(BUCKETS).fill(0);
    let word = 12345n;
    for (let i = 0; i < DRAWS; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const v = draw(word, 0, keccakRehash).value;
      counts[Math.floor(v / (WEIGHT_DENOM / BUCKETS))]!++;
    }
    const stat = chiSquare(counts, DRAWS);
    expect(stat, `chi-square ${stat.toFixed(1)} exceeded ${CRITICAL}`).toBeLessThan(CRITICAL);
  });

  it('the forbidden `word % 10000` is measurably biased, so this gate has teeth', () => {
    // 2^256 mod 10000 != 0, so low residues get one extra preimage. Measure it
    // directly on the window domain, where the effect is large enough to see:
    // 65536 = 6*10000 + 5536, so values 0..5535 are 7/65536 likely and the rest 6/65536.
    const preimages = new Array<number>(WEIGHT_DENOM).fill(0);
    for (let v = 0; v < 65_536; v++) preimages[v % WEIGHT_DENOM]!++;
    expect(preimages[0]).toBe(7);
    expect(preimages[9_999]).toBe(6);

    const total = 65_536;
    const counts = new Array<number>(BUCKETS).fill(0);
    for (let v = 0; v < WEIGHT_DENOM; v++) counts[Math.floor(v / (WEIGHT_DENOM / BUCKETS))]! += preimages[v]!;
    const stat = chiSquare(counts, total);
    expect(stat, 'naive modulo should be detectably biased').toBeGreaterThan(CRITICAL);

    // And rejection sampling removes it completely: below 60000 every residue
    // has exactly 6 preimages.
    const fair = new Array<number>(WEIGHT_DENOM).fill(0);
    for (let v = 0; v < RNG_LIMIT; v++) fair[v % WEIGHT_DENOM]!++;
    expect(new Set(fair).size).toBe(1);
    expect(fair[0]).toBe(6);
  });
});

describe('mapping a draw to a lot', () => {
  it('matches the cumulative weight table at every boundary', () => {
    expect(CUMULATIVE_WEIGHTS).toEqual([6690, 7690, 9290, 9840, 9980, 10000]);
    for (let i = 0; i < LOTS.length; i++) {
      const lot = LOTS[i]!;
      const upper = CUMULATIVE_WEIGHTS[i]!;
      const lower = i === 0 ? 0 : CUMULATIVE_WEIGHTS[i - 1]!;
      expect(lotForDraw(lower).id, `lower edge of lot ${i}`).toBe(lot.id);
      expect(lotForDraw(upper - 1).id, `upper edge of lot ${i}`).toBe(lot.id);
      if (upper < WEIGHT_DENOM) expect(lotForDraw(upper).id).toBe(lot.id + 1);
    }
  });

  it('rejects a draw outside [0, 10000)', () => {
    expect(() => lotForDraw(-1)).toThrow(RangeError);
    expect(() => lotForDraw(WEIGHT_DENOM)).toThrow(RangeError);
    expect(() => lotForDraw(1.5)).toThrow(RangeError);
  });

  it('reproduces the paytable frequencies within 0.5% over 1,000,000 draws', () => {
    const seen = new Map<number, number>();
    const DRAWS = 1_000_000;
    let word = 99n;
    for (let i = 0; i < DRAWS; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const { lot } = drawLot(word, 0, keccakRehash);
      seen.set(lot.id, (seen.get(lot.id) ?? 0) + 1);
    }
    for (const lot of LOTS) {
      const observed = (seen.get(lot.id) ?? 0) / DRAWS;
      const expected = lot.weight / WEIGHT_DENOM;
      expect(Math.abs(observed - expected), `${lot.name}: saw ${observed}, expected ${expected}`).toBeLessThan(0.005);
    }
  });
});

describe('bytes32 conversion', () => {
  it('round-trips hex, bigint and bytes', () => {
    const hex = '0x7d6e59b3159ff534a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';
    const word = wordFromHex(hex);
    expect(wordToHex(word)).toBe(hex);
    expect(wordFromBytes(wordToBytes(word))).toBe(word);
    expect(wordToBytes(word)).toHaveLength(32);
  });

  it('left-pads a short word to 64 hex digits, as the chain writes it', () => {
    expect(wordToHex(1n)).toBe(`0x${'0'.repeat(63)}1`);
  });

  it('rejects things that are not bytes32', () => {
    expect(() => wordFromHex('0x')).toThrow(RangeError);
    expect(() => wordFromHex('0xzz')).toThrow(RangeError);
    expect(() => wordFromHex('0x' + '0'.repeat(65))).toThrow(RangeError);
  });
});
