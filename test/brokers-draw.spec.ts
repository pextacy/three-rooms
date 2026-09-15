/**
 * I3 for THE BROKERS — randomness is drawn by rejection sampling, never
 * `word % n`, and every table comes out at the weights it publishes.
 *
 * There is nothing hidden in this game, so the interesting property is not
 * secrecy but ORDER: the word that decides what a broker says is requested by
 * the action that pays his fee, and so does not exist while the player is
 * deciding whether to ask him.
 */
import { describe, it, expect } from 'vitest';
import { keccak256 } from 'viem';
import { readFileSync } from 'node:fs';
import { drawHousePrice, drawQuote } from '../src/games/brokers/core/draw';
import { BROKER_LIST, HOUSE, WEIGHT_DENOM } from '../src/games/brokers/core/market';
import { wordToBytes, wordFromBytes, MAX_REHASHES, type Rehash } from '../src/shared/rng';

/** The same rehash the contract uses: keccak256 over the raw 32 bytes. */
const rehash: Rehash = w => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(w)))));

function* words(seed: bigint): Generator<bigint> {
  let word = seed;
  for (;;) {
    word = BigInt(keccak256(wordToBytes(word)));
    yield word;
  }
}

describe("the house's price", () => {
  it('only ever produces a price the house actually names', () => {
    const allowed = new Set(HOUSE.map(q => q.priceBp));
    const stream = words(1_728n);
    for (let i = 0; i < 2_000; i++) {
      expect(allowed.has(drawHousePrice(stream.next().value, 0, rehash).priceBp)).toBe(true);
    }
  });

  it('follows the published weights to within 5 sigma', () => {
    const N = 20_000;
    const counts = new Map<number, number>();
    const stream = words(99n);
    for (let i = 0; i < N; i++) {
      const price = drawHousePrice(stream.next().value, 0, rehash).priceBp;
      counts.set(price, (counts.get(price) ?? 0) + 1);
    }
    for (const quote of HOUSE) {
      const p = quote.weight / WEIGHT_DENOM;
      const sigma = Math.sqrt(N * p * (1 - p));
      expect(Math.abs((counts.get(quote.priceBp) ?? 0) - N * p), `${quote.priceBp}`).toBeLessThan(5 * sigma);
    }
  });
});

describe('what a broker names', () => {
  it('only ever comes from his own table', () => {
    for (const broker of BROKER_LIST) {
      const allowed = new Set(broker.quotes.map(q => q.priceBp));
      const stream = words(BigInt(500 + broker.id));
      for (let i = 0; i < 1_000; i++) {
        expect(allowed.has(drawQuote(broker.id, stream.next().value, 0, rehash).priceBp), broker.name).toBe(true);
      }
    }
  });

  it('follows his published weights to within 5 sigma — the rare ones included', () => {
    const N = 40_000;
    for (const broker of BROKER_LIST) {
      const counts = new Map<number, number>();
      const stream = words(BigInt(9_000 + broker.id));
      for (let i = 0; i < N; i++) {
        const price = drawQuote(broker.id, stream.next().value, 0, rehash).priceBp;
        counts.set(price, (counts.get(price) ?? 0) + 1);
      }
      for (const quote of broker.quotes) {
        const p = quote.weight / WEIGHT_DENOM;
        const sigma = Math.sqrt(N * p * (1 - p));
        const seen = counts.get(quote.priceBp) ?? 0;
        expect(
          Math.abs(seen - N * p),
          `${broker.name} ${quote.priceBp}: ${seen} of ${N}, expected ~${(N * p).toFixed(0)}`,
        ).toBeLessThan(5 * sigma);
      }
    }
  }, 30_000);

  it('gives the same answer for the same word, every time', () => {
    const stream = words(31n);
    for (let i = 0; i < 100; i++) {
      const word = stream.next().value;
      expect(drawQuote(0, word, 0, rehash).priceBp).toBe(drawQuote(0, word, 0, rehash).priceBp);
    }
  });

  it('and a different answer for a different man, from the same word', () => {
    // The word does not carry the price; the TABLE does. Two brokers reading the
    // same word land in their own tables, which is what makes one word per ask
    // enough.
    const word = words(7n).next().value;
    const named = BROKER_LIST.map(broker => drawQuote(broker.id, word, 0, rehash).priceBp);
    for (const [i, price] of named.entries()) {
      expect(BROKER_LIST[i]?.quotes.some(q => q.priceBp === price)).toBe(true);
    }
  });
});

describe('the bound the contract also carries', () => {
  it('the rehash cap is the same number in both languages', () => {
    const solidity = readFileSync(new URL('../contracts/Brokers.sol', import.meta.url), 'utf8');
    const declared = /MAX_REHASHES\s*=\s*(\d+)/.exec(solidity)?.[1];
    expect(declared, 'Brokers.sol declares a rehash cap').toBeDefined();
    expect(Number(declared), 'and it is the same bound as the TS mirror').toBe(MAX_REHASHES);
  });

  it('and neither has an unbounded loop in a settlement path', () => {
    const solidity = readFileSync(new URL('../contracts/Brokers.sol', import.meta.url), 'utf8');
    expect(/while\s*\(\s*true\s*\)/.test(solidity)).toBe(false);
    expect(solidity).toContain('tries < 64');
  });
});
