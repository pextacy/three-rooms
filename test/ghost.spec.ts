/**
 * The Ghost Lot (prd.md §2, §10; claude.md §7).
 *
 * The retention loop, and the single mechanic most able to turn into a
 * loss-chasing nudge if nobody is watching it. Three properties matter and all
 * three are tested here:
 *
 *   1. it is drawn only AFTER the round is settled, so it cannot leak;
 *   2. it changes no payout;
 *   3. it is never dramatised — no "you were so close", ever.
 */
import { describe, it, expect } from 'vitest';
import { createDemoHost } from '../src/bridge/demoHost';
import type { CandleHost, HostView } from '../src/bridge/types';
import { LOTS, lotById } from '../src/game/paytable';
import { INCHES } from '../src/game/wax';
import { COPY } from '../src/ui/copy';

const STAKE = 20n * 10n ** 18n;

/** Every string anywhere in the copy, however deeply nested. */
function everyString(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(everyString);
  if (value && typeof value === 'object') return Object.values(value).flatMap(everyString);
  return [];
}

function nextView(host: CandleHost, predicate: (v: HostView) => boolean): Promise<HostView> {
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

/** Plays one round, claiming at `claimAt` or riding to the gutter. */
async function playRound(host: CandleHost, claimAt: number) {
  await host.openSession(STAKE);
  for (;;) {
    const view = await nextView(host, v => v.session?.phase === 'waiting-player' || v.session?.isSettled === true);
    const session = view.session;
    if (!session) throw new Error('lost the session');
    if (session.isSettled) return session;
    await host.submitAction(session.inch >= claimAt ? 'CLAIM' : 'BURN');
  }
}

const freshHost = (seed: number) => createDemoHost({ seed: [seed, 0x1728, 0xc4, 0x5e], randomnessDelayMs: 0 });

describe('the ghost cannot leak', () => {
  it('is null at every point before the round settles', async () => {
    const host = freshHost(11);
    await host.openSession(STAKE);

    for (let guard = 0; guard < INCHES * 2; guard++) {
      const view = await nextView(host, v => v.session?.phase === 'waiting-player' || v.session?.isSettled === true);
      const session = view.session;
      if (!session) throw new Error('lost the session');
      if (session.isSettled) break;
      expect(session.ghostLotId, `inch ${session.inch} still open`).toBeNull();
      await host.submitAction('BURN');
    }
    host.destroy();
  });

  it('appears only once the round is over', async () => {
    const host = freshHost(12);
    const settled = await playRound(host, 2);
    expect(settled.isSettled).toBe(true);
    if (settled.inch < INCHES) expect(settled.ghostLotId).not.toBeNull();
    host.destroy();
  });

  it('draws a real lot from the paytable, not a flattering one', async () => {
    const seen = new Map<number, number>();
    for (let round = 0; round < 400; round++) {
      const host = freshHost(round + 100);
      const settled = await playRound(host, 1); // claim at the first inch every time
      if (settled.ghostLotId !== null) {
        seen.set(settled.ghostLotId, (seen.get(settled.ghostLotId) ?? 0) + 1);
      }
      host.destroy();
    }
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(350);

    // The empty crate is 66.9% of the paytable, so most ghosts are nothing at
    // all. A ghost that was always a jackpot would be a loss-chasing nudge.
    const empties = seen.get(0) ?? 0;
    expect(empties / total).toBeGreaterThan(0.55);
    expect(empties / total).toBeLessThan(0.78);
  });

  it('is null after a gutter — there was no next lot, and inventing one would be a lie', async () => {
    for (let seed = 0; seed < 60; seed++) {
      const host = freshHost(seed + 500);
      const settled = await playRound(host, INCHES + 1); // never claim
      if (settled.inch >= INCHES) {
        expect(settled.ghostLotId).toBeNull();
      }
      host.destroy();
    }
  });
});

describe('the ghost changes nothing', () => {
  it('the payout is the same whether or not a ghost was drawn', async () => {
    const host = freshHost(21);
    const settled = await playRound(host, 1);
    const lot = settled.lotId !== null ? lotById(settled.lotId) : null;
    if (!lot) throw new Error('settled with no lot');
    // The payout is the claimed lot's, never the ghost's.
    const expected = (STAKE * BigInt(lot.faceBp) * 10_000n) / 1_000_000n;
    expect(settled.payoutBase).toBe(expected);
    host.destroy();
  });

  it('never pays out the ghost by accident', async () => {
    for (let seed = 0; seed < 40; seed++) {
      const host = freshHost(seed + 900);
      const settled = await playRound(host, 2);
      if (settled.ghostLotId === null || settled.lotId === null) {
        host.destroy();
        continue;
      }
      const claimed = lotById(settled.lotId);
      const expected = (STAKE * BigInt(claimed.faceBp) * BigInt([10000, 8500, 7000, 5500, 4000][settled.inch - 1]!)) / 1_000_000n;
      expect(settled.payoutBase, `seed ${seed}`).toBe(expected);
      host.destroy();
    }
  });
});

describe('the ghost is never dramatised (claude.md §7, prd.md §10)', () => {
  const surfaces = [COPY.ghostLabel, COPY.ghostNone, COPY.ghostNote];

  it('states the fact and stops', () => {
    expect(COPY.ghostLabel).toBe('The next lot would have been');
    expect(COPY.ghostNote).toContain('changed nothing');
  });

  it('carries no exclamation, no near-miss language, no second person blame', () => {
    const forbidden = [/!/, /so close/i, /almost/i, /you were/i, /just miss/i, /bad luck/i, /unlucky/i, /try again/i, /one more/i];
    for (const text of surfaces) {
      for (const pattern of forbidden) {
        expect(pattern.test(text), `"${text}" matches ${pattern}`).toBe(false);
      }
    }
  });

  it('never congratulates or commiserates anywhere in the copy', () => {
    const all = everyString(COPY);
    expect(all.length).toBeGreaterThan(40);
    for (const text of all) {
      expect(/!/.test(text), `"${text}" has an exclamation mark`).toBe(false);
      expect(/\b(congratulations|well done|nice one|hard luck|so close)\b/i.test(text), `"${text}"`).toBe(false);
    }
  });

  it('never writes "you lose" — it says what happened', () => {
    for (const text of everyString(COPY)) expect(/you lose|you lost/i.test(text), `"${text}"`).toBe(false);
    expect(COPY.claimedAt(3)).toBe('Claimed at the third inch.');
    expect(COPY.tookNothing).toBe('The crate was empty.');
  });

  it('names every lot it could show', () => {
    for (const lot of LOTS) expect(lot.name.length).toBeGreaterThan(0);
  });
});
