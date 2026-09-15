/**
 * The round state machine for THE SURVEY, and the two rules that make it safe.
 *
 *  - **DECLINE settles without randomness.** It pays the same whatever she was,
 *    so a player who walks away can never be left waiting on a word that never
 *    comes. Every other exit needs one.
 *  - **UNDERWRITE commits before anything is drawn.** The condition arrives on a
 *    separate input, which is the client's mirror of invariant I4: the word that
 *    decides her does not exist until the call is locked in.
 */
import { describe, it, expect } from 'vitest';
import {
  openRound,
  transition,
  legalInputs,
  isTerminal,
  tally,
  underwritePayout,
  declinePayout,
  RoundTransitionError,
  type RoundState,
} from '../src/games/survey/core/round';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, payoutBase, cargoById } from '../src/games/survey/core/vessel';

const STAKE = 100n * 10n ** 18n;
const CARGO = CARGOES[3]!; // Wine, 2.50x

const opened = () => transition(openRound(STAKE), { type: 'OFFER', cargoId: CARGO.id });

const report = (state: RoundState, ...reports: ('SOUND' | 'ROTTEN')[]) =>
  reports.reduce((s, r) => transition(s, { type: 'REPORT', report: r }), state);

describe('opening', () => {
  it('refuses a stake of nothing', () => {
    expect(() => openRound(0n)).toThrow(RangeError);
    expect(() => openRound(-1n)).toThrow(RangeError);
  });

  it('starts with no manifest, nobody aboard and nothing known', () => {
    const state = openRound(STAKE);
    expect(state.phase).toBe('OFFERED');
    expect(state.cargo).toBeNull();
    expect(state.surveys).toBe(0);
    expect(state.margin).toBe(0);
    expect(state.wasSound).toBeNull();
    expect(legalInputs(state)).toEqual(['OFFER']);
  });

  it('takes the manifest exactly once', () => {
    const state = opened();
    expect(state.phase).toBe('WEIGHING');
    expect(state.cargo?.id).toBe(CARGO.id);
    expect(() => transition(state, { type: 'OFFER', cargoId: CARGO.id })).toThrow(RoundTransitionError);
  });
});

describe('the surveyors', () => {
  it('each report moves the margin by exactly one, in its own direction', () => {
    let state = opened();
    state = report(state, 'SOUND');
    expect(state).toMatchObject({ surveys: 1, margin: 1 });
    state = report(state, 'ROTTEN');
    expect(state, 'a disagreeing pair returns the margin to zero').toMatchObject({ surveys: 2, margin: 0 });
    state = report(state, 'ROTTEN', 'ROTTEN');
    expect(state).toMatchObject({ surveys: 4, margin: -2 });
  });

  it('the tally is the margin, read out loud', () => {
    const state = report(opened(), 'SOUND', 'ROTTEN', 'SOUND');
    expect(tally(state)).toEqual({ sound: 2, rotten: 1 });
    expect(state.margin).toBe(1);
  });

  it('refuses a surveyor when there is nobody left to send', () => {
    let state = opened();
    for (let k = 0; k < MAX_SURVEYS; k++) state = report(state, 'SOUND');
    expect(state.surveys).toBe(MAX_SURVEYS);
    expect(() => transition(state, { type: 'SURVEY' })).toThrow(RoundTransitionError);
    expect(() => transition(state, { type: 'REPORT', report: 'SOUND' })).toThrow(RoundTransitionError);
    expect(legalInputs(state)).toEqual(['UNDERWRITE', 'DECLINE']);
  });

  it('SURVEY changes nothing by itself — the report is a separate word', () => {
    // This is the shape of the contract: the action requests randomness, and
    // the report only lands when it is fulfilled.
    const state = opened();
    expect(transition(state, { type: 'SURVEY' })).toEqual(state);
  });
});

describe('the call', () => {
  it('DECLINE settles at once, with no condition ever drawn', () => {
    const state = transition(opened(), { type: 'DECLINE' });
    expect(state.phase).toBe('DECLINED');
    expect(isTerminal(state)).toBe(true);
    expect(state.wasSound, 'nothing was underwritten, so nothing was decided').toBeNull();
    expect(state.payoutBase).toBe(payoutBase(STAKE, DECLINE_BP, 0));
    expect(legalInputs(state)).toEqual([]);
  });

  it('declining pays the same whatever she would have been', () => {
    for (let k = 0; k <= MAX_SURVEYS; k++) {
      let state = opened();
      for (let i = 0; i < k; i++) state = report(state, i % 2 === 0 ? 'SOUND' : 'ROTTEN');
      expect(declinePayout(state)).toBe(payoutBase(STAKE, DECLINE_BP, k));
    }
  });

  it('UNDERWRITE commits, and only then can she be resolved', () => {
    const committed = transition(opened(), { type: 'UNDERWRITE' });
    expect(committed.phase).toBe('COMMITTED');
    expect(committed.payoutBase, 'nothing is paid before the word arrives').toBe(0n);
    expect(legalInputs(committed)).toEqual(['RESOLVE']);

    const home = transition(committed, { type: 'RESOLVE', isSound: true });
    expect(home.phase).toBe('SETTLED');
    expect(home.wasSound).toBe(true);
    expect(home.payoutBase).toBe(payoutBase(STAKE, CARGO.valueBp, 0));

    const lost = transition(committed, { type: 'RESOLVE', isSound: false });
    expect(lost.payoutBase).toBe(0n);
    expect(lost.wasSound).toBe(false);
  });

  it('cannot resolve a voyage that was never underwritten', () => {
    expect(() => transition(opened(), { type: 'RESOLVE', isSound: true })).toThrow(RoundTransitionError);
    const declined = transition(opened(), { type: 'DECLINE' });
    expect(() => transition(declined, { type: 'RESOLVE', isSound: true })).toThrow(RoundTransitionError);
  });

  it('cannot act at all once the round is over', () => {
    const settled = transition(transition(opened(), { type: 'UNDERWRITE' }), { type: 'RESOLVE', isSound: true });
    for (const input of [{ type: 'SURVEY' }, { type: 'UNDERWRITE' }, { type: 'DECLINE' }] as const) {
      expect(() => transition(settled, input), input.type).toThrow(RoundTransitionError);
    }
  });

  it('every surveyor costs the same slice of what underwriting can pay', () => {
    let state = opened();
    let previous = underwritePayout(state);
    for (let k = 1; k <= MAX_SURVEYS; k++) {
      state = report(state, 'SOUND');
      const now = underwritePayout(state);
      expect(now, `after ${k} surveys`).toBeLessThan(previous);
      previous = now;
    }
  });
});

describe('what a player can never do', () => {
  it('lose more than the stake', () => {
    // There is no bust state and nothing accumulates (claude.md §7). The worst
    // case anywhere in the machine is a payout of zero.
    for (const cargo of CARGOES) {
      const committed = transition(transition(openRound(STAKE), { type: 'OFFER', cargoId: cargo.id }), {
        type: 'UNDERWRITE',
      });
      const lost = transition(committed, { type: 'RESOLVE', isSound: false });
      expect(lost.payoutBase).toBe(0n);
      expect(lost.payoutBase).toBeGreaterThanOrEqual(0n);
    }
  });

  it('be paid more than the richest cargo with no surveys', () => {
    const ceiling = payoutBase(STAKE, Math.max(...CARGOES.map(c => c.valueBp)), 0);
    for (const cargo of CARGOES) {
      let state = transition(openRound(STAKE), { type: 'OFFER', cargoId: cargo.id });
      for (let k = 0; k <= MAX_SURVEYS; k++) {
        expect(underwritePayout(state)).toBeLessThanOrEqual(ceiling);
        expect(declinePayout(state)).toBeLessThanOrEqual(ceiling);
        if (k < MAX_SURVEYS) state = report(state, 'SOUND');
      }
    }
  });

  it('see a cargo that is not on the manifest', () => {
    for (const cargo of CARGOES) expect(cargoById(cargo.id)).toBe(cargo);
    // @ts-expect-error — an id off the end of the manifest is not a CargoId
    expect(() => cargoById(9)).toThrow(RangeError);
  });
});
