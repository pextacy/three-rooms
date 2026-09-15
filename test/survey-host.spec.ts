/**
 * The free-play host for THE SURVEY, and the three disciplines it exists to
 * keep.
 *
 *   1. **The Ghost Report cannot leak.** It is drawn only after the call is
 *      locked in, it changes no payout, and it is never dramatised.
 *   2. **The condition cannot be known early.** The demo mirrors the contract's
 *      reversed generative order: reports come from the predictive distribution
 *      as they are asked for, and whether she was sound is decided out of a word
 *      that does not exist until UNDERWRITE has already been submitted.
 *   3. **The purse is honest.** It escrows the stake like the facet does, pays
 *      exactly what the one payout rule says, and lasts one page load.
 */
import { describe, it, expect } from 'vitest';
import { createDemoSurveyHost, DEMO_OPENING_PURSE, DEMO_MIN_STAKE } from '../src/games/survey/app/bridge/demoHost';
import type { SurveyHost, SurveyView } from '../src/games/survey/app/bridge/types';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, payoutBase, cargoById } from '../src/games/survey/core/vessel';
import { COPY } from '../src/games/survey/app/ui/copy';

const STAKE = 20n * 10n ** 18n;

/** Every string anywhere in the copy, however deeply nested. */
function everyString(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(everyString);
  if (value && typeof value === 'object') return Object.values(value).flatMap(everyString);
  return [];
}

function nextView(host: SurveyHost, predicate: (v: SurveyView) => boolean): Promise<SurveyView> {
  const now = host.snapshot();
  if (predicate(now)) return Promise.resolve(now);
  return new Promise(resolve => {
    const unsubscribe = host.subscribe(view => {
      if (!predicate(view)) return;
      unsubscribe();
      resolve(view);
    });
  });
}

const settled = (v: SurveyView) => v.session?.isSettled === true;
const ready = (v: SurveyView) => v.session?.phase === 'waiting-player' || settled(v);

const freshHost = (seed: number) => createDemoSurveyHost({ seed: [seed, 0x1728, 0xc4, 0x5e], randomnessDelayMs: 0 });

/** Sends `surveys` surveyors, then makes the call. */
async function playVoyage(host: SurveyHost, surveys: number, call: 'UNDERWRITE' | 'DECLINE') {
  await host.openSession(STAKE);
  for (let k = 0; k < surveys; k++) {
    await nextView(host, ready);
    await host.submitAction('SURVEY');
  }
  await nextView(host, ready);
  await host.submitAction(call);
  const view = await nextView(host, settled);
  const session = view.session;
  if (!session) throw new Error('lost the session');
  return session;
}

describe('the ghost cannot leak', () => {
  it('is null at every point before the call is made', async () => {
    const host = freshHost(11);
    await host.openSession(STAKE);

    for (let k = 0; k < MAX_SURVEYS; k++) {
      const view = await nextView(host, ready);
      const session = view.session;
      if (!session) throw new Error('lost the session');
      expect(session.ghostReport, `after ${session.surveys} surveys`).toBeNull();
      expect(session.wasSound, 'and nothing is known about her either').toBeNull();
      await host.submitAction('SURVEY');
    }
    host.destroy();
  });

  it('arrives once the call is locked in, whichever call it was', async () => {
    for (const call of ['UNDERWRITE', 'DECLINE'] as const) {
      const host = freshHost(call === 'UNDERWRITE' ? 21 : 22);
      const session = await playVoyage(host, 1, call);
      expect(session.ghostReport, call).not.toBeNull();
      expect(['SOUND', 'ROTTEN']).toContain(session.ghostReport);
      host.destroy();
    }
  });

  it('is absent when every surveyor has already reported', async () => {
    // There was nobody left to send, and inventing one would be a lie.
    const host = freshHost(33);
    const session = await playVoyage(host, MAX_SURVEYS, 'DECLINE');
    expect(session.surveys).toBe(MAX_SURVEYS);
    expect(session.ghostReport).toBeNull();
    host.destroy();
  });

  it('changes no payout', async () => {
    const host = freshHost(44);
    const session = await playVoyage(host, 2, 'DECLINE');
    expect(session.payoutBase).toBe(payoutBase(STAKE, DECLINE_BP, session.surveys));
    host.destroy();
  });

  it('is never dramatised — no exclamation, no "so close", anywhere in the copy', () => {
    const forbidden = [/!/, /so close/i, /almost/i, /unlucky/i, /if only/i, /just missed/i];
    for (const value of everyString(COPY)) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
    expect(COPY.ghostNote).toMatch(/changed nothing/i);
  });
});

describe('the generative order the contract uses', () => {
  it('her condition is unknown until UNDERWRITE has been submitted', async () => {
    const host = freshHost(55);
    await host.openSession(STAKE);
    await nextView(host, ready);

    // Everything the client could possibly read, before the call:
    const before = host.snapshot().session;
    expect(before?.wasSound).toBeNull();
    expect(JSON.stringify(before, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toMatch(/"wasSound":(true|false)/);

    await host.submitAction('UNDERWRITE');
    const after = await nextView(host, settled);
    expect(typeof after.session?.wasSound, 'and only then is she decided').toBe('boolean');
    host.destroy();
  });

  it('a declined voyage never decides her at all', async () => {
    const host = freshHost(66);
    const session = await playVoyage(host, 1, 'DECLINE');
    expect(session.wasSound, 'nothing was underwritten, so nothing was drawn').toBeNull();
    host.destroy();
  });

  it('the reports move the margin by one each, in the order they arrive', async () => {
    const host = freshHost(77);
    await host.openSession(STAKE);
    let previous = 0;
    for (let k = 0; k < MAX_SURVEYS; k++) {
      await nextView(host, ready);
      await host.submitAction('SURVEY');
      const view = await nextView(host, v => (v.session?.surveys ?? 0) === k + 1);
      const session = view.session;
      if (!session) throw new Error('lost the session');
      expect(Math.abs(session.margin - previous), `report ${k + 1}`).toBe(1);
      expect(session.lastReport).toBe(session.margin > previous ? 'SOUND' : 'ROTTEN');
      previous = session.margin;
    }
    host.destroy();
  });
});

describe('the purse', () => {
  it('escrows the stake and pays the one payout rule, exactly', async () => {
    const host = freshHost(88);
    const opening = host.snapshot().purseBase ?? 0n;
    expect(opening).toBe(DEMO_OPENING_PURSE);

    const session = await playVoyage(host, 2, 'UNDERWRITE');
    const cargo = session.cargoId !== null ? cargoById(session.cargoId) : null;
    if (!cargo) throw new Error('no cargo');

    const expected = session.wasSound ? payoutBase(STAKE, cargo.valueBp, session.surveys) : 0n;
    expect(session.payoutBase).toBe(expected);
    expect(host.snapshot().purseBase).toBe(opening - STAKE + expected);
    host.destroy();
  });

  it('refuses a stake below the minimum or above the purse', async () => {
    const host = freshHost(99);
    await expect(host.openSession(DEMO_MIN_STAKE - 1n)).rejects.toThrow();
    await expect(host.openSession(DEMO_OPENING_PURSE + 1n)).rejects.toThrow();
    host.destroy();
  });

  it('refuses a second voyage while one is open, and allows one after it settles', async () => {
    const host = freshHost(101);
    await host.openSession(STAKE);
    await nextView(host, ready);
    await expect(host.openSession(STAKE)).rejects.toThrow();

    await host.submitAction('DECLINE');
    await nextView(host, settled);
    host.dealAgain();
    await expect(host.openSession(STAKE)).resolves.toBeUndefined();
    host.destroy();
  });

  it('refills to the opening purse, because it lasts one page load', async () => {
    const host = freshHost(111);
    await playVoyage(host, 0, 'DECLINE');
    host.dealAgain();
    host.refill?.();
    expect(host.snapshot().purseBase).toBe(DEMO_OPENING_PURSE);
    host.destroy();
  });

  it('never pays more than the richest cargo with no surveys', async () => {
    const ceiling = payoutBase(STAKE, Math.max(...CARGOES.map(c => c.valueBp)), 0);
    const host = freshHost(121);
    for (let round = 0; round < 40; round++) {
      const session = await playVoyage(host, round % (MAX_SURVEYS + 1), round % 2 === 0 ? 'UNDERWRITE' : 'DECLINE');
      expect(session.payoutBase).toBeLessThanOrEqual(ceiling);
      host.dealAgain();
    }
    host.destroy();
  }, 20_000);
});

describe('the same seed plays the same voyages', () => {
  it('so a reported round can be reproduced, and a demo can be recorded', async () => {
    const play = async () => {
      const host = freshHost(1728);
      const rows: string[] = [];
      for (let round = 0; round < 6; round++) {
        const session = await playVoyage(host, 2, 'UNDERWRITE');
        rows.push(`${session.cargoId}:${session.margin}:${session.wasSound}:${session.payoutBase}`);
        host.dealAgain();
      }
      host.destroy();
      return rows.join('|');
    };
    expect(await play()).toBe(await play());
  });
});
