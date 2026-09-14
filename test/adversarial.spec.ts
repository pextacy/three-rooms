/**
 * Adversarial input to the contract.
 *
 * The facet commits `keccak256(encodedSession)` and every later call echoes the
 * snapshot back, so a player cannot forge `gameState` in practice. That is the
 * real defence. These tests are the second one: they check that the game refuses
 * input it never issued, so a weakened commitment would not immediately become a
 * drained vault.
 *
 * Everything here is a `view` call straight at the contract, bypassing the facet
 * — which is exactly the attacker's position if the commitment ever failed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { candleAddress, chainIsUp, loadDeployment, publicClient, candleAbi, makeCtx, encodeGameState, type Deployment } from './helpers/chain';
import { LOTS, MAX_FACE_BP } from '../src/games/candle/core/paytable';
import { INCHES, payoutBase } from '../src/games/candle/core/wax';

const address = candleAddress();
const deployment = loadDeployment();
const live = address !== null && deployment !== null && (await chainIsUp(deployment));
const describeLive = live ? describe : describe.skip;
if (!live) console.warn('\n  adversarial: no local chain — run `npm run sdk:stack`. SKIPPING.\n');

const STAKE = 10n ** 20n;
const CLAIM = '0x00' as const;
const BURN = '0x01' as const;
const VALID_FACES = new Set(LOTS.map(l => l.faceBp));

describeLive('a face value the paytable never issued is refused', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('refuses the largest face value that fits in the field', async () => {
    // 65535 bp would price a "655x" lot — 26 times the declared maximum.
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 0xffff, true) });
    await expect(read('onPlayerAction', [ctx, CLAIM])).rejects.toThrow();
    await expect(read('quoteForfeitPayout', [ctx])).rejects.toThrow();
  });

  it('refuses every face value between the real ones', async () => {
    const probes = [1, 49, 51, 99, 101, 150, 199, 201, 499, 501, 2499, 2501, 10_000];
    for (const faceBp of probes) {
      expect(VALID_FACES.has(faceBp), `${faceBp} should not be a real face`).toBe(false);
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, faceBp, true) });
      await expect(read('onPlayerAction', [ctx, CLAIM]), `faceBp ${faceBp}`).rejects.toThrow();
    }
  });

  it('still accepts every face value the paytable does issue', async () => {
    for (const lot of LOTS) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, lot.faceBp, true) });
      const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, CLAIM]);
      expect(r.payout, lot.name).toBe(payoutBase(STAKE, lot.faceBp, 1));
    }
  });

  it('refuses a lot that claims to be absent while carrying a value', async () => {
    // hasLot = false with faceBp set is incoherent: it would let a burn carry a
    // face value forward into the next inch.
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(2, 2500, false) });
    await expect(read('onRandomness', [ctx, `0x${'11'.repeat(32)}`])).rejects.toThrow();
  });
});

describeLive('no reachable input can exceed the declared maximum', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('every accepted (inch, face) pays at most 25x, and only at the first inch', async () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, lot.faceBp, true) });
        const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, CLAIM]);
        expect(r.payout).toBeLessThanOrEqual(STAKE * 25n);
        if (r.payout === STAKE * 25n) {
          expect(inch, '25x outside the first inch').toBe(1);
          expect(lot.faceBp).toBe(MAX_FACE_BP);
        }
      }
    }
  });

  it('an inch outside the ladder is refused, so wax can never be read out of range', async () => {
    for (const inch of [0, INCHES + 1, 200, 255]) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, 100, true) });
      await expect(read('onPlayerAction', [ctx, CLAIM]), `inch ${inch}`).rejects.toThrow();
    }
  });

  it('a malformed gameState length is refused rather than read past its end', async () => {
    for (const bad of ['0x', '0x01', '0x0100', '0x010064', '0x01006401ff', `0x${'00'.repeat(64)}`]) {
      const ctx = { ...makeCtx({ wagerBase: STAKE }), gameState: bad as `0x${string}` };
      await expect(read('onPlayerAction', [ctx, CLAIM]), bad).rejects.toThrow();
    }
  });

  it('an extreme wager reverts on overflow rather than wrapping', async () => {
    // Solidity 0.8 checks arithmetic, so this is a revert and not a silent wrap
    // to a small reserve — which is the outcome that would actually be dangerous.
    const huge = (1n << 255n) - 1n;
    await expect(read('quoteCaps', [huge, '0x'])).rejects.toThrow();
    await expect(read('onSessionStart', [makeCtx({ wagerBase: huge })])).rejects.toThrow();
  });

  it('a wager of zero is refused rather than opening an unbacked session', async () => {
    await expect(read('onSessionStart', [makeCtx({ wagerBase: 0n })])).rejects.toThrow();
  });
});

describeLive('the state machine cannot be walked backwards or sideways', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('a second lot cannot be dealt onto an occupied table', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(2, 100, true) });
    await expect(read('onRandomness', [ctx, `0x${'22'.repeat(32)}`])).rejects.toThrow();
  });

  it('an action cannot be taken on an empty table', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(2, 0, false) });
    await expect(read('onPlayerAction', [ctx, CLAIM])).rejects.toThrow();
    await expect(read('onPlayerAction', [ctx, BURN])).rejects.toThrow();
  });

  it('BURN at the last inch is refused, so the wax can never run past the gutter', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(INCHES, 2500, true) });
    await expect(read('onPlayerAction', [ctx, BURN])).rejects.toThrow();
  });

  it('an unknown action byte is refused rather than defaulting to a claim', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(1, 2500, true) });
    for (const action of ['0x02', '0x03', '0xff', '0x']) {
      await expect(read('onPlayerAction', [ctx, action]), action).rejects.toThrow();
    }
  });

  it('every step after the first releases no reserve, whatever it is handed', async () => {
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeGameState(inch, lot.faceBp, true) });
        const r = await read<{ reservedProfitDelta: bigint; escrowDelta: bigint }>('onPlayerAction', [ctx, CLAIM]);
        expect(r.reservedProfitDelta, `inch ${inch} ${lot.name}`).toBe(0n);
        expect(r.escrowDelta).toBe(0n);
      }
    }
  });
});
