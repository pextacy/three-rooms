/**
 * Money is moved by the player, never by a render.
 *
 * Free play deals the next round by itself — that is the whole of "zero clicks
 * to comprehension" (claude.md §5): a stranger who opens the bare URL sees a
 * lot on the table, not a stake form. Inside a host the same code path would
 * call `openSession`, which stakes the player's own chUSD, and it must not.
 *
 * The rule lived as four inlined lines in all three games, checked by nothing.
 * That is the dangerous shape for a rule like this: dropping `kind === 'demo'`
 * throws no error, fails no test and breaks no render — the game simply starts
 * staking real money on load, and the first person to find out is a player.
 *
 * So the condition has a name and this walks all of it, including the
 * combinations the demo host never reaches on its own.
 */
import { describe, it, expect } from 'vitest';
import { mayAutoDeal, type AutoDealView } from '../src/shared/bridge';

const STAKE = 10n ** 20n; // 100 chUSD at 18 decimals

const demo = (purseBase: bigint | null): AutoDealView => ({ kind: 'demo', purseBase });
const chain = (purseBase: bigint | null): AutoDealView => ({ kind: 'chain', purseBase });

describe('a real-money session is never opened without the player', () => {
  it('refuses on the chain host, however healthy everything else looks', () => {
    expect(mayAutoDeal(chain(STAKE * 100n), STAKE, null)).toBe(false);
  });

  it('refuses on the chain host even when the host publishes no purse', () => {
    // `purseBase === null` is the host path's normal shape: the wallet is the
    // host's business, not ours. It must not read as "unlimited, go ahead".
    expect(mayAutoDeal(chain(null), STAKE, null)).toBe(false);
  });

  it('refuses on the chain host at every stake, including zero', () => {
    for (const stake of [0n, 1n, STAKE, STAKE * 1_000_000n]) {
      expect(mayAutoDeal(chain(null), stake, null), `stake ${stake}`).toBe(false);
      expect(mayAutoDeal(chain(STAKE * 100n), stake, null), `stake ${stake}`).toBe(false);
    }
  });

  it('refuses before a host has resolved at all', () => {
    expect(mayAutoDeal(null, STAKE, null)).toBe(false);
  });
});

describe('free play keeps dealing, because nothing is at stake', () => {
  it('deals when the purse covers the stake', () => {
    expect(mayAutoDeal(demo(STAKE * 20n), STAKE, null)).toBe(true);
  });

  it('deals when the purse is exactly the stake — the last affordable round', () => {
    expect(mayAutoDeal(demo(STAKE), STAKE, null)).toBe(true);
  });

  it('stops when the purse is one base unit short, leaving REFILL in reach', () => {
    expect(mayAutoDeal(demo(STAKE - 1n), STAKE, null)).toBe(false);
  });

  it('stops while the stake control is refusing the stake', () => {
    // Whatever the field is already complaining about — too small, too large,
    // not affordable — auto-dealing past it would open a round the player was
    // being told they could not have.
    expect(mayAutoDeal(demo(STAKE * 20n), STAKE, 'stake too small')).toBe(false);
  });

  it('deals when the demo host publishes no purse', () => {
    expect(mayAutoDeal(demo(null), STAKE, null)).toBe(true);
  });
});

describe('the kind is what decides it, not the purse', () => {
  it('is false for every non-demo kind at an identical view', () => {
    const purses: (bigint | null)[] = [null, 0n, STAKE, STAKE * 100n];
    for (const purse of purses) {
      const free = mayAutoDeal(demo(purse), STAKE, null);
      const real = mayAutoDeal(chain(purse), STAKE, null);
      expect(real, `purse ${purse}: the chain host never auto-deals`).toBe(false);
      // and the only thing that changed between the two calls is `kind`
      if (free) expect(real).not.toBe(free);
    }
  });
});
