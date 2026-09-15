/**
 * The round state machine for THE BROKERS, and the two rules that make it a
 * different game from the other two.
 *
 *  - **RECALL.** Every price named stays available; the best price in hand can
 *    only go up, and `TAKE` is legal at every single point of the round. There
 *    is no forced move and no losing state anywhere in this machine.
 *  - **A fee is owed the moment a man is asked**, not when he answers. Asking
 *    the same man twice would charge twice for a price already on the table, so
 *    it is refused.
 */
import { describe, it, expect } from 'vitest';
import {
  openRound,
  transition,
  legalInputs,
  isTerminal,
  feesPaid,
  takePayout,
  hasAsked,
  unasked,
  holding,
  RoundTransitionError,
  type RoundState,
} from '../src/games/brokers/core/round';
import { BROKER_LIST, HOUSE, feesForMask, payoutBase, type BrokerId } from '../src/games/brokers/core/market';

const STAKE = 100n * 10n ** 18n;
const HOUSE_LOW = Math.min(...HOUSE.map(q => q.priceBp));
const HOUSE_HIGH = Math.max(...HOUSE.map(q => q.priceBp));

const opened = (priceBp = HOUSE_LOW) => transition(openRound(STAKE), { type: 'OPEN', priceBp });
const ask = (state: RoundState, id: BrokerId, priceBp: number) =>
  transition(transition(state, { type: 'ASK', brokerId: id }), { type: 'QUOTE', priceBp });

describe('opening', () => {
  it('refuses a stake of nothing', () => {
    expect(() => openRound(0n)).toThrow(RangeError);
    expect(() => openRound(-1n)).toThrow(RangeError);
  });

  it('starts with nothing named and nothing owed', () => {
    const state = openRound(STAKE);
    expect(state.phase).toBe('OPENING');
    expect(state.named).toEqual([]);
    expect(state.bestBp).toBe(0);
    expect(feesPaid(state)).toBe(0);
    expect(legalInputs(state)).toEqual(['OPEN']);
  });

  it("takes the house's price exactly once", () => {
    const state = opened();
    expect(state.phase).toBe('SHOPPING');
    expect(state.bestBp).toBe(HOUSE_LOW);
    expect(state.named).toHaveLength(1);
    expect(state.named[0]?.brokerId).toBeNull();
    expect(() => transition(state, { type: 'OPEN', priceBp: HOUSE_HIGH })).toThrow(RoundTransitionError);
  });

  it('and that price is already yours: TAKE is legal immediately', () => {
    expect(legalInputs(opened())).toContain('TAKE');
  });
});

describe('recall', () => {
  it('the best price in hand only ever goes up', () => {
    let state = opened(HOUSE_HIGH);
    const seen: number[] = [state.bestBp];
    state = ask(state, 0, 5_500);
    seen.push(state.bestBp);
    state = ask(state, 1, 12_500);
    seen.push(state.bestBp);
    state = ask(state, 2, 4_000);
    seen.push(state.bestBp);

    expect(seen).toEqual([HOUSE_HIGH, HOUSE_HIGH, 12_500, 12_500]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
  });

  it('a worse price changes nothing but the fee', () => {
    const before = opened(HOUSE_HIGH);
    const after = ask(before, 3, 3_500);
    expect(after.bestBp).toBe(before.bestBp);
    expect(feesPaid(after)).toBe(feesPaid(before) + (BROKER_LIST[3]?.feeBp ?? 0));
    expect(takePayout(after)).toBeLessThan(takePayout(before));
  });

  it('every price named stays on the record, in order', () => {
    let state = opened();
    state = ask(state, 1, 9_000);
    state = ask(state, 2, 23_000);
    expect(state.named.map(n => n.priceBp)).toEqual([HOUSE_LOW, 9_000, 23_000]);
    expect(holding(state)?.priceBp).toBe(23_000);
    expect(holding(state)?.brokerId).toBe(2);
  });
});

describe('the fees', () => {
  it('are owed the moment a man is asked, before he says anything', () => {
    const asked = transition(opened(), { type: 'ASK', brokerId: 0 });
    expect(feesPaid(asked)).toBe(BROKER_LIST[0]?.feeBp);
    expect(asked.waitingOn).toBe(0);
  });

  it('follow the mask and nothing else', () => {
    let state = opened();
    for (const broker of BROKER_LIST) {
      state = ask(state, broker.id, broker.quotes[0]?.priceBp ?? 0);
      expect(feesPaid(state)).toBe(feesForMask(state.askedMask));
    }
  });

  it('refuse a second look from the same man', () => {
    const state = ask(opened(), 0, 9_500);
    expect(hasAsked(state, 0)).toBe(true);
    expect(() => transition(state, { type: 'ASK', brokerId: 0 })).toThrow(RoundTransitionError);
  });

  it('and nobody else can be asked while one of them is looking', () => {
    const waiting = transition(opened(), { type: 'ASK', brokerId: 0 });
    expect(() => transition(waiting, { type: 'ASK', brokerId: 1 })).toThrow(RoundTransitionError);
    expect(() => transition(waiting, { type: 'TAKE' })).toThrow(RoundTransitionError);
    expect(legalInputs(waiting)).toEqual(['QUOTE']);
  });
});

describe('selling', () => {
  it('pays what is in hand less what the day has cost', () => {
    let state = opened(HOUSE_HIGH);
    state = ask(state, 2, 23_000);
    const settled = transition(state, { type: 'TAKE' });
    expect(settled.phase).toBe('SETTLED');
    expect(isTerminal(settled)).toBe(true);
    expect(settled.payoutBase).toBe(payoutBase(STAKE, 23_000, BROKER_LIST[2]?.feeBp ?? 0));
  });

  it('is legal at every point of the round — there is no forced move', () => {
    let state = opened();
    expect(legalInputs(state)).toContain('TAKE');
    for (const broker of BROKER_LIST) {
      state = ask(state, broker.id, broker.quotes[0]?.priceBp ?? 0);
      expect(legalInputs(state), `after ${broker.name}`).toContain('TAKE');
    }
    // With everybody asked, selling is the only move left — and it is a move
    // the player could have made at any earlier point.
    expect(legalInputs(state)).toEqual(['TAKE']);
    expect(unasked(state)).toEqual([]);
  });

  it('cannot be undone, and nothing can be asked afterwards', () => {
    const settled = transition(opened(), { type: 'TAKE' });
    for (const input of [{ type: 'TAKE' }, { type: 'ASK', brokerId: 0 }, { type: 'OPEN', priceBp: 1 }] as const) {
      expect(() => transition(settled, input as never), input.type).toThrow(RoundTransitionError);
    }
  });
});

describe('what a player can never do', () => {
  it('lose the stake', () => {
    // The worst line in the game: the house lowballs and every fee is spent on
    // a man who names something worse.
    let state = opened(HOUSE_LOW);
    for (const broker of BROKER_LIST) {
      state = ask(state, broker.id, Math.min(...broker.quotes.map(q => q.priceBp)));
    }
    const settled = transition(state, { type: 'TAKE' });
    expect(settled.payoutBase).toBeGreaterThan(0n);
    expect(settled.bestBp).toBe(HOUSE_LOW);
  });

  it('be paid for a price nobody named', () => {
    const state = opened();
    expect(state.bestBp).toBe(HOUSE_LOW);
    expect(HOUSE.some(q => q.priceBp === state.bestBp)).toBe(true);
  });
});
