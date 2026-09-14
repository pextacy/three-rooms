/**
 * xoshiro128** — the demo's word source (docs.md §4.2).
 *
 * Seeded once per page load from `crypto.getRandomValues`. This is NOT the
 * game's randomness model: with a host present the contract's VRF is the only
 * authority. It exists so the free-play build can synthesise the same message
 * shapes without a chain, and its output still goes through the real
 * `src/game/rng.ts` rejection sampler — so the demo's distribution IS the
 * production distribution.
 */
export type Prng = {
  /** Next 32-bit unsigned value. */
  nextUint32(): number;
  /** A fresh 256-bit word, the shape `src/game/rng.ts` consumes. */
  nextWord(): bigint;
};

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function createPrng(seed: readonly [number, number, number, number]): Prng {
  let [s0, s1, s2, s3] = seed.map(n => n >>> 0) as [number, number, number, number];
  // An all-zero state is a fixed point; nudge it rather than emitting zeros.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 0x9e3779b9;

  const nextUint32 = (): number => {
    // `>>> 0` is the only safe way to land back in [0, 2^32). A trailing
    // `& 0xffffffff` would NOT work: JS bitwise-and operates on SIGNED 32-bit
    // ints, so anything at or above 2^31 comes back negative.
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  return {
    nextUint32,
    nextWord() {
      let word = 0n;
      for (let i = 0; i < 8; i++) word = (word << 32n) | BigInt(nextUint32());
      return word;
    },
  };
}

/** Seeds from the platform CSPRNG. Falls back only where `crypto` is absent. */
export function seedFromCrypto(): [number, number, number, number] {
  const out = new Uint32Array(4);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 0x100000000) >>> 0;
  }
  return [out[0] ?? 1, out[1] ?? 2, out[2] ?? 3, out[3] ?? 4];
}
