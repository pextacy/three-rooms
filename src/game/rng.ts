/**
 * `bytes32` -> a uniform lot, by rejection sampling (docs.md §2.4).
 *
 * **`word % 10000` is forbidden** and is explicitly on the reviewer's checklist.
 * 2^256 is not a multiple of 10,000, so the modulo is biased. This mirrors
 * `Candle.sol` window for window and rejection for rejection (claude.md I3, I11).
 *
 * The SDK states the general rule in `RANDOMNESS_DICE.md`: for a domain of size
 * `M` and `n` outcomes, `limit = floor(M/n) * n`, reject `>= limit`, then `% n`.
 * Here `M = 2^16 = 65536` and `n = 10000`, so `limit = 6 * 10000 = 60000`.
 *
 * Pure: no ambient randomness, no clock, no DOM. The word is an input.
 */
import { WEIGHT_DENOM, lotForDraw, type Lot } from './paytable';

/** A VRF word, as an unsigned 256-bit integer. */
export type Word = bigint;

/** Sixteen 16-bit windows in a 256-bit word. */
export const WINDOWS = 16;

/** The largest multiple of `WEIGHT_DENOM` that fits in 16 bits. */
export const RNG_LIMIT = 60_000;

const WINDOW_MASK = 0xffffn;
const WORD_BITS = 256n;
const WINDOW_BITS = 16n;

/**
 * Expands an exhausted word into a fresh one. The contract uses
 * `keccak256(abi.encodePacked(seed))` over the raw 32 bytes; `src/game/` is
 * pure and carries no hash implementation, so callers inject it.
 *
 * The path is reached with probability (5536/65536)^16 ≈ 1.4e-18 — it exists so
 * that the function is total rather than reverting, not because it will run.
 */
export type Rehash = (word: Word) => Word;

/** Throws instead of rehashing. Fine wherever exhaustion is not a real risk. */
export const REHASH_UNSUPPORTED: Rehash = () => {
  throw new Error(
    'all 16 windows were rejected (p ~ 1.4e-18) and no rehash function was supplied',
  );
};

export type DrawResult = {
  /** Uniform on [0, WEIGHT_DENOM). */
  readonly value: number;
  /** Where the next draw from this word should start. */
  readonly cursor: number;
  /** The word to keep reading from — changed only if a rehash happened. */
  readonly word: Word;
  /** How many windows were rejected. Zero in ~91.5% of draws. */
  readonly rejected: number;
};

function windowAt(word: Word, index: number): number {
  const shift = WORD_BITS - WINDOW_BITS * BigInt(index + 1);
  return Number((word >> shift) & WINDOW_MASK);
}

/**
 * Reads 16-bit windows from `word` starting at `cursor`, rejecting any window
 * at or above `RNG_LIMIT` so the surviving range is an exact multiple of
 * `WEIGHT_DENOM`. Exactly uniform on [0, 10000).
 *
 * The per-window rejection probability is 5536/65536 ≈ 8.45%, so a draw
 * consumes ≈ 1.09 windows on average and one word carries an inch with room to
 * spare.
 */
export function draw(word: Word, cursor = 0, rehash: Rehash = REHASH_UNSUPPORTED): DrawResult {
  if (word < 0n || word >= 1n << WORD_BITS) throw new RangeError('word is not a 256-bit value');
  if (!Number.isInteger(cursor) || cursor < 0) throw new RangeError('cursor must be a non-negative integer');

  let current = word;
  let index = cursor;
  let rejected = 0;

  // Bounded only by the rehash budget; each pass consumes 16 windows.
  for (;;) {
    if (index < WINDOWS) {
      const v = windowAt(current, index);
      index++;
      if (v < RNG_LIMIT) {
        return { value: v % WEIGHT_DENOM, cursor: index, word: current, rejected };
      }
      rejected++;
      continue;
    }
    current = rehash(current);
    index = 0;
  }
}

/** The same draw, mapped through the paytable's cumulative weights. */
export function drawLot(
  word: Word,
  cursor = 0,
  rehash: Rehash = REHASH_UNSUPPORTED,
): DrawResult & { readonly lot: Lot } {
  const result = draw(word, cursor, rehash);
  return { ...result, lot: lotForDraw(result.value) };
}

// ---------------------------------------------------------------------------
//  bytes32 <-> bigint
// ---------------------------------------------------------------------------

/** `0x…` (64 hex digits) -> word. Accepts shorter hex and left-pads. */
export function wordFromHex(hex: string): Word {
  const body = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (body.length === 0 || body.length > 64 || !/^[0-9a-fA-F]+$/.test(body)) {
    throw new RangeError(`not a bytes32 hex string: ${hex}`);
  }
  return BigInt(`0x${body}`);
}

/** word -> `0x…` with exactly 64 hex digits, as the chain writes it. */
export function wordToHex(word: Word): string {
  if (word < 0n || word >= 1n << WORD_BITS) throw new RangeError('word is not a 256-bit value');
  return `0x${word.toString(16).padStart(64, '0')}`;
}

/** word -> the 32 big-endian bytes keccak256 would be fed. */
export function wordToBytes(word: Word): Uint8Array {
  if (word < 0n || word >= 1n << WORD_BITS) throw new RangeError('word is not a 256-bit value');
  const bytes = new Uint8Array(32);
  let remaining = word;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function wordFromBytes(bytes: Uint8Array): Word {
  if (bytes.length !== 32) throw new RangeError(`expected 32 bytes, got ${bytes.length}`);
  let word = 0n;
  for (const byte of bytes) word = (word << 8n) | BigInt(byte);
  return word;
}
