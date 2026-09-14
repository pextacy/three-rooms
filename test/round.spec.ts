/**
 * The round state machine (docs.md §2.5).
 *
 * "Every other input is rejected, not ignored, and rejection is a test case."
 * The rejections are the point of this file.
 */
import { describe, it, expect } from 'vitest';
import { lightCandle, transition, isTerminal, legalInputs, payoutIfClaimedNow, waxNow, RoundTransitionError, type RoundState } from '../src/games/candle/core/round';
import { LOTS, type LotId } from '../src/games/candle/core/paytable';
import { INCHES, WAX_BP, payoutBase } from '../src/games/candle/core/wax';

const STAKE = 1_000_000n;
const EMPTY: LotId = 0;
const CORDAGE: LotId = 2; // 1.00x
const JACKPOT: LotId = 5; // 25.00x

/** Burn down to `inch` with an empty crate each time, then offer `lotId`. */
const atInch = (inch: number, lotId: LotId, stake = STAKE): RoundState => {
  let s = lightCandle(stake);
  for (let k = 1; k < inch; k++) {
    s = transition(s, { type: 'OFFER', lotId: EMPTY });
    s = transition(s, { type: 'BURN' });
  }
  return transition(s, { type: 'OFFER', lotId });
};

describe('lighting the candle', () => {
  it('starts LIT at the first inch with nothing on the table', () => {
    const s = lightCandle(STAKE);
    expect(s).toMatchObject({ phase: 'LIT', inch: 1, lot: null, payoutBase: 0n, forced: false });
  });

  it('refuses a non-positive stake', () => {
    expect(() => lightCandle(0n)).toThrow(RangeError);
    expect(() => lightCandle(-1n)).toThrow(RangeError);
  });
});

describe('legal transitions', () => {
  it('OFFER puts a lot on the table', () => {
    const s = transition(lightCandle(STAKE), { type: 'OFFER', lotId: CORDAGE });
    expect(s.phase).toBe('OFFERED');
    expect(s.lot?.faceBp).toBe(100);
    expect(s.forced).toBe(false);
  });

  it('BURN spends an inch and clears the table', () => {
    const s = transition(atInch(1, CORDAGE), { type: 'BURN' });
    expect(s).toMatchObject({ phase: 'LIT', inch: 2, lot: null, forced: false });
  });

  it('CLAIM settles at the current inch', () => {
    const s = transition(atInch(2, CORDAGE), { type: 'CLAIM' });
    expect(s.phase).toBe('CLAIMED');
    expect(s.payoutBase).toBe(payoutBase(STAKE, 100, 2));
    expect(isTerminal(s)).toBe(true);
  });

  it('the fifth inch is marked forced and settles as GUTTERED, not CLAIMED', () => {
    const offered = atInch(INCHES, CORDAGE);
    expect(offered.forced).toBe(true);
    const s = transition(offered, { type: 'CLAIM' });
    expect(s.phase).toBe('GUTTERED');
    expect(s.payoutBase).toBe(payoutBase(STAKE, 100, INCHES));
  });

  it('walks all five inches', () => {
    let s = lightCandle(STAKE);
    for (let k = 1; k <= INCHES; k++) {
      s = transition(s, { type: 'OFFER', lotId: EMPTY });
      expect(s.inch).toBe(k);
      if (k < INCHES) s = transition(s, { type: 'BURN' });
    }
    expect(s.forced).toBe(true);
    expect(transition(s, { type: 'CLAIM' }).phase).toBe('GUTTERED');
  });
});

describe('illegal transitions are rejected, not ignored', () => {
  it('BURN at the fifth inch is refused — the fifth inch has no exit but a claim', () => {
    const s = atInch(INCHES, JACKPOT);
    expect(() => transition(s, { type: 'BURN' })).toThrow(RoundTransitionError);
    expect(() => transition(s, { type: 'BURN' })).toThrow(/no exit but a claim/);
  });

  it('CLAIM with nothing on the table is refused', () => {
    expect(() => transition(lightCandle(STAKE), { type: 'CLAIM' })).toThrow(RoundTransitionError);
  });

  it('BURN with nothing on the table is refused', () => {
    expect(() => transition(lightCandle(STAKE), { type: 'BURN' })).toThrow(RoundTransitionError);
  });

  it('OFFER onto an occupied table is refused', () => {
    expect(() => transition(atInch(1, CORDAGE), { type: 'OFFER', lotId: EMPTY })).toThrow(/already on the table/);
  });

  it('nothing at all is legal from a terminal phase', () => {
    for (const terminal of [transition(atInch(1, CORDAGE), { type: 'CLAIM' }), transition(atInch(INCHES, CORDAGE), { type: 'CLAIM' })]) {
      expect(legalInputs(terminal)).toEqual([]);
      expect(() => transition(terminal, { type: 'CLAIM' })).toThrow(RoundTransitionError);
      expect(() => transition(terminal, { type: 'BURN' })).toThrow(RoundTransitionError);
      expect(() => transition(terminal, { type: 'OFFER', lotId: EMPTY })).toThrow(RoundTransitionError);
    }
  });

  it('an unknown lot id is refused', () => {
    expect(() => transition(lightCandle(STAKE), { type: 'OFFER', lotId: 9 as LotId })).toThrow(RangeError);
  });

  it('legalInputs never offers BURN at the last inch', () => {
    for (let k = 1; k <= INCHES; k++) {
      const offered = atInch(k, CORDAGE);
      expect(legalInputs(offered)).toEqual(k < INCHES ? ['CLAIM', 'BURN'] : ['CLAIM']);
      expect(legalInputs({ ...offered, phase: 'LIT', lot: null })).toEqual(['OFFER']);
    }
  });
});

describe('the state machine is pure', () => {
  it('never mutates the state it is given', () => {
    const before = atInch(2, CORDAGE);
    const snapshot = JSON.stringify(before, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    transition(before, { type: 'CLAIM' });
    transition(before, { type: 'BURN' });
    expect(JSON.stringify(before, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(snapshot);
  });

  it('gives the same answer every time', () => {
    const s = atInch(3, JACKPOT);
    expect(transition(s, { type: 'CLAIM' })).toEqual(transition(s, { type: 'CLAIM' }));
  });
});

describe('what the table is worth right now', () => {
  it('is zero while nothing is on the table', () => {
    expect(payoutIfClaimedNow(lightCandle(STAKE))).toBe(0n);
  });

  it('falls 15 points of the prize per inch', () => {
    const values = [];
    for (let k = 1; k <= INCHES; k++) values.push(payoutIfClaimedNow(atInch(k, CORDAGE)));
    expect(values).toEqual(WAX_BP.map(bp => (STAKE * 100n * BigInt(bp)) / 1_000_000n));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThan(values[i - 1]!);
  });

  it('reports the wax at the current inch, which drives the light model', () => {
    for (let k = 1; k <= INCHES; k++) expect(waxNow(atInch(k, EMPTY))).toBe(WAX_BP[k - 1]);
  });

  it('the 25x lot is worth 25x only at the first inch', () => {
    expect(payoutIfClaimedNow(atInch(1, JACKPOT))).toBe(STAKE * 25n);
    for (let k = 2; k <= INCHES; k++) expect(payoutIfClaimedNow(atInch(k, JACKPOT))).toBeLessThan(STAKE * 25n);
  });

  it('an empty crate is worth nothing at every inch', () => {
    for (let k = 1; k <= INCHES; k++) expect(payoutIfClaimedNow(atInch(k, EMPTY))).toBe(0n);
  });

  it('the player can never lose more than the stake', () => {
    for (let k = 1; k <= INCHES; k++) {
      for (const lot of LOTS) {
        expect(payoutIfClaimedNow(atInch(k, lot.id))).toBeGreaterThanOrEqual(0n);
      }
    }
  });
});
