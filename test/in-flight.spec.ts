/**
 * One call at a time, on the two calls that cost money.
 *
 * `openSession` and `submitAction` each end in a wallet transaction, and
 * neither changes the local view until the host pushes a new snapshot back — a
 * network round trip later. Until then `canAct` is still true and the button is
 * still live, so a second click sent a second transaction for the same
 * decision. Nothing could be spent twice, because the facet rejects the
 * duplicate against the session commitment; what the player got was a second
 * signing prompt and an error for a move they made once.
 *
 * The keyboard made that easy rather than unlikely: none of the three games
 * filtered `event.repeat`, so holding Space asked at the OS key-repeat rate —
 * about thirty a second.
 */
import { describe, it, expect } from 'vitest';
import { createGate } from '../src/shared/bridge';

/** A call that does not finish until it is released, like a wallet prompt. */
function held() {
  let release: (() => void) | null = null;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release: () => release?.() };
}

describe('the gate lets one call through at a time', () => {
  it('refuses a second call while the first is outstanding', async () => {
    const gate = createGate();
    const wallet = held();
    let calls = 0;

    const first = gate.run(async () => {
      calls++;
      await wallet.promise;
      return 'first';
    });
    const second = gate.run(async () => {
      calls++;
      return 'second';
    });

    expect(calls, 'the duplicate never ran').toBe(1);
    expect(gate.busy).toBe(true);
    expect(await second, 'a refused duplicate resolves to undefined, it does not throw').toBeUndefined();

    wallet.release();
    expect(await first).toBe('first');
    expect(gate.busy).toBe(false);
  });

  it('a held key cannot queue a burst — thirty presses inside one round trip send one', async () => {
    const gate = createGate();
    const wallet = held();
    let calls = 0;

    const pending = Array.from({ length: 30 }, () =>
      gate.run(async () => {
        calls++;
        await wallet.promise;
      }),
    );

    expect(calls, 'one decision, one transaction').toBe(1);
    wallet.release();
    await Promise.all(pending);
    expect(calls).toBe(1);
  });

  it('opens again once the first has landed — it is a gate, not a one-shot', async () => {
    const gate = createGate();
    let calls = 0;
    const run = () => gate.run(async () => void calls++);

    await run();
    await run();
    await run();
    expect(calls).toBe(3);
  });

  it('releases when the call throws, so one rejection cannot wedge the game shut', async () => {
    const gate = createGate();
    await expect(
      gate.run(async () => {
        throw new Error('the wallet said no');
      }),
    ).rejects.toThrow('the wallet said no');

    expect(gate.busy, 'the gate is open again').toBe(false);
    let ran = false;
    await gate.run(async () => void (ran = true));
    expect(ran, 'and the next decision still goes through').toBe(true);
  });

  it('two gates do not share a lock', async () => {
    const a = createGate();
    const b = createGate();
    const wallet = held();
    let bRan = false;

    const pending = a.run(async () => wallet.promise);
    await b.run(async () => void (bRan = true));
    expect(bRan).toBe(true);

    wallet.release();
    await pending;
  });
});
