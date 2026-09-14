/**
 * I11 — contract math and client math agree bit-for-bit on every reachable state.
 *
 * All 30 `(inch, lot)` states, plus a 4,096-word RNG corpus. Where the two
 * disagree, the game is broken no matter which one is "right": with a host
 * present the contract is the only authority on outcomes, and the client's job
 * is to animate what it is told without ever showing a different number.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { keccak256 } from 'viem';
import { candleAddress, chainIsUp, loadDeployment, publicClient, candleAbi, makeCtx, encodeGameState, decodeGameState, type Deployment } from './helpers/chain';
import { LOTS, lotForDraw, WEIGHT_DENOM } from '../src/game/paytable';
import { INCHES, payoutBase } from '../src/game/wax';
import { draw, wordToBytes, wordFromBytes, type Rehash } from '../src/game/rng';

const address = candleAddress();
const deployment = loadDeployment();
// The deployment file outlives the stack, so the CHAIN is what gets checked.
const live = address !== null && deployment !== null && (await chainIsUp(deployment));

const keccakRehash: Rehash = w => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(w)))));

const describeLive = live ? describe : describe.skip;
if (!live) {
  console.warn('\n  parity: no local chain — run `npm run sdk:stack`. SKIPPING.\n');
}

const STAKE = 10n ** 20n; // 100 chUSD at 18 decimals
const CLAIM = '0x00' as const;
const BURN = '0x01' as const;

describeLive('I11 — TS core vs Solidity, all 30 (inch, lot) states', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;

  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('agrees on the payout for every reachable state, to the base unit', async () => {
    let checked = 0;
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, lot.faceBp, true) });
        const result = await read<{ payout: bigint }>('onPlayerAction', [ctx, CLAIM]);
        expect(result.payout, `inch ${inch}, ${lot.name}`).toBe(payoutBase(STAKE, lot.faceBp, inch));
        checked++;
      }
    }
    expect(checked).toBe(INCHES * LOTS.length);
    expect(checked).toBe(30);
  });

  it('agrees on the forfeit quote for every reachable state', async () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, lot.faceBp, true) });
        const quote = await read<bigint>('quoteForfeitPayout', [ctx]);
        expect(quote, `inch ${inch}, ${lot.name}`).toBe(payoutBase(STAKE, lot.faceBp, inch));
      }
    }
  });

  it('quotes zero while no lot is on the table — nothing is cashable', async () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, 0, false) });
      expect(await read<bigint>('quoteForfeitPayout', [ctx])).toBe(0n);
    }
  });

  it('floors the same way the TS core does on an awkward stake', async () => {
    // 0.50x at the second inch is 42.5% of the stake: an odd stake must floor
    // identically in both languages, or a 25x win is one wei out of the cap.
    for (const stake of [1n, 3n, 7n, 999n, 123_456_789n, 10n ** 18n + 1n]) {
      for (let inch = 1; inch <= INCHES; inch++) {
        for (const lot of LOTS) {
          const ctx = makeCtx({ wagerBase: stake, escrowedStake: stake, reservedProfit: stake * 24n, gameState: encodeGameState(inch, lot.faceBp, true) });
          const result = await read<{ payout: bigint }>('onPlayerAction', [ctx, CLAIM]);
          expect(result.payout, `stake ${stake}, inch ${inch}, ${lot.faceBp}bp`).toBe(payoutBase(stake, lot.faceBp, inch));
        }
      }
    }
  });
});

describeLive('I11 — the RNG corpus', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;

  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('draws the same lot as the TS core on a 4,096-word corpus', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 0, false) });
    let word = 0x1728n; // Lloyd's Coffee House, 1728
    const batch: Promise<void>[] = [];

    for (let i = 0; i < 4096; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
      const expected = lotForDraw(draw(word, 0, keccakRehash).value);
      batch.push(
        read<{ newGameState: string }>('onRandomness', [ctx, hex]).then(result => {
          const state = decodeGameState(result.newGameState);
          expect(state.faceBp, `word ${hex}`).toBe(expected.faceBp);
          expect(state.hasLot).toBe(true);
          expect(state.inch).toBe(1);
        }),
      );
      if (batch.length >= 64) {
        await Promise.all(batch.splice(0, batch.length));
      }
    }
    await Promise.all(batch);
  }, 120_000);

  it('agrees on a word that exhausts every window and forces a rehash', async () => {
    // All sixteen windows are 0xFFFF, so both implementations must rehash with
    // keccak256 over the raw 32 bytes and carry on. Probability in the wild is
    // ~1.4e-18; the point is that the path is total and identical.
    const exhausted = (1n << 256n) - 1n;
    const hex = `0x${'f'.repeat(64)}` as const;
    const expected = lotForDraw(draw(exhausted, 0, keccakRehash).value);
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 0, false) });
    const result = await read<{ newGameState: string }>('onRandomness', [ctx, hex]);
    expect(decodeGameState(result.newGameState).faceBp).toBe(expected.faceBp);
  });

  it('never produces a draw outside the paytable', async () => {
    const faces = new Set(LOTS.map(l => l.faceBp));
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 0, false) });
    let word = 7n;
    for (let i = 0; i < 128; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
      const result = await read<{ newGameState: string }>('onRandomness', [ctx, hex]);
      expect(faces.has(decodeGameState(result.newGameState).faceBp)).toBe(true);
    }
  }, 60_000);
});

describeLive('I11 — the state machine agrees with the contract', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;

  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('BURN advances the inch and asks for another word, at inches 1..4', async () => {
    for (let inch = 1; inch < INCHES; inch++) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, 100, true) });
      const r = await read<{ newGameState: string; nextPhase: number; requestRandomnessNow: boolean; payout: bigint; reservedProfitDelta: bigint }>('onPlayerAction', [ctx, BURN]);
      const next = decodeGameState(r.newGameState);
      expect(next.inch).toBe(inch + 1);
      expect(next.hasLot).toBe(false);
      expect(next.faceBp).toBe(0);
      expect(r.nextPhase).toBe(1); // WAITING_RANDOMNESS
      expect(r.requestRandomnessNow).toBe(true);
      expect(r.payout).toBe(0n);
      expect(r.reservedProfitDelta, 'I7 — the reserve is never released mid-round').toBe(0n);
    }
  });

  it('BURN at the fifth inch reverts — the fifth inch has no exit but a claim', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(INCHES, 100, true) });
    await expect(read('onPlayerAction', [ctx, BURN])).rejects.toThrow();
  });

  it('the fifth inch settles inside onRandomness, so it never waits for a player', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(INCHES, 0, false) });
    const r = await read<{ nextPhase: number; requestRandomnessNow: boolean }>('onRandomness', [ctx, `0x${'11'.repeat(32)}`]);
    expect(r.nextPhase, 'SETTLED').toBe(3);
    expect(r.requestRandomnessNow).toBe(false);
  });

  it('inches 1..4 hand control back to the player instead of settling', async () => {
    for (let inch = 1; inch < INCHES; inch++) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, 0, false) });
      const r = await read<{ nextPhase: number; payout: bigint }>('onRandomness', [ctx, `0x${'22'.repeat(32)}`]);
      expect(r.nextPhase, 'WAITING_PLAYER_ACTION').toBe(2);
      expect(r.payout).toBe(0n);
    }
  });

  it('refuses a second lot on an occupied table, and an action on an empty one', async () => {
    const occupied = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(2, 100, true) });
    await expect(read('onRandomness', [occupied, `0x${'33'.repeat(32)}`])).rejects.toThrow();

    const empty = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(2, 0, false) });
    await expect(read('onPlayerAction', [empty, CLAIM])).rejects.toThrow();
  });

  it('refuses an unknown action and an out-of-range inch', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 100, true) });
    await expect(read('onPlayerAction', [ctx, '0x02'])).rejects.toThrow();
    await expect(read('onPlayerAction', [ctx, '0x'])).rejects.toThrow();

    for (const badInch of [0, INCHES + 1, 255]) {
      const bad = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(badInch, 100, true) });
      await expect(read('quoteForfeitPayout', [bad]), `inch ${badInch}`).rejects.toThrow();
    }
  });

  it('agrees that a draw maps into [0, 10000)', () => {
    expect(WEIGHT_DENOM).toBe(10_000);
  });
});
