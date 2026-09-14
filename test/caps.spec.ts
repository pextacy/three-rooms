/**
 * I5 / I7 — a 25x win pays the facet cap to the base unit and does not revert.
 *
 * This is `plan.md` R6, the risk that only shows up on the first big win in
 * production. The facet caps payout at `escrowedStake + reservedProfit` with
 * ZERO slack: an independent re-derivation that differs by one wei reverts
 * every jackpot. So the assertion is equality, not "less than or equal".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { candleAddress, loadDeployment, publicClient, candleAbi, makeCtx, encodeGameState, decodeGameState, type Deployment } from './helpers/chain';
import { LOTS, MAX_FACE_BP, TOP_TIER_WEIGHT, WEIGHT_DENOM } from '../src/game/paytable';
import { INCHES, payoutBase } from '../src/game/wax';
import { solve } from '../src/game/solve';

const address = candleAddress();
const deployment = loadDeployment();
const live = address !== null && deployment !== null;
const describeLive = live ? describe : describe.skip;
if (!live) console.warn('\n  caps: CandleGame is not deployed locally — run `npm run sdk:stack`. SKIPPING.\n');

const STAKES = [1n, 7n, 1_000n, 10n ** 18n, 10n ** 20n, 123_456_789_987_654_321n];
const solution = solve();

describeLive('I5 — quoteCaps reserves exactly the maximum payout', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('maxEscrowStake is the wager — escrow never rises mid-round', async () => {
    for (const wager of STAKES) {
      const [maxEscrowStake] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      expect(maxEscrowStake, `wager ${wager}`).toBe(wager);
    }
  });

  it('maxReservedProfit is exactly maxPayout - wager, with no slack', async () => {
    for (const wager of STAKES) {
      const [, maxReservedProfit] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      const maxPayout = payoutBase(wager, MAX_FACE_BP, 1);
      expect(maxReservedProfit, `wager ${wager}`).toBe(maxPayout - wager);
    }
  });

  it('the facet cap (escrow + reserve) equals the largest payout the game can make', async () => {
    for (const wager of STAKES) {
      const [maxEscrowStake, maxReservedProfit] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      const facetCap = maxEscrowStake + maxReservedProfit;

      // The most the game can pay, searched over every reachable state rather
      // than assumed to be the top lot at the first inch.
      let worst = 0n;
      for (let inch = 1; inch <= INCHES; inch++) {
        for (const lot of LOTS) {
          const p = payoutBase(wager, lot.faceBp, inch);
          if (p > worst) worst = p;
        }
      }
      expect(worst, `wager ${wager}: cap must not exceed the real maximum`).toBe(facetCap);
    }
  });

  it('the 25x claim lands exactly on the cap — not one wei over', async () => {
    for (const wager of STAKES) {
      const [maxEscrowStake, maxReservedProfit] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      const ctx = makeCtx({
        wagerBase: wager,
        escrowedStake: maxEscrowStake,
        reservedProfit: maxReservedProfit,
        gameState: encodeGameState(1, MAX_FACE_BP, true),
      });
      const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, '0x00']);
      expect(r.payout, `wager ${wager}`).toBe(maxEscrowStake + maxReservedProfit);
      expect(r.payout).toBe(wager * 25n);
    }
  });

  it('no reachable state can ever pay more than the cap', async () => {
    const wager = 10n ** 20n;
    const [maxEscrowStake, maxReservedProfit] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
    const cap = maxEscrowStake + maxReservedProfit;
    for (let inch = 1; inch <= INCHES; inch++) {
      for (const lot of LOTS) {
        const ctx = makeCtx({ wagerBase: wager, escrowedStake: maxEscrowStake, reservedProfit: maxReservedProfit, gameState: encodeGameState(inch, lot.faceBp, true) });
        const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, '0x00']);
        expect(r.payout, `inch ${inch}, ${lot.name}`).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('25x is reachable only at the first inch', async () => {
    const wager = 10n ** 20n;
    for (let inch = 2; inch <= INCHES; inch++) {
      const ctx = makeCtx({ wagerBase: wager, gameState: encodeGameState(inch, MAX_FACE_BP, true) });
      const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, '0x00']);
      expect(r.payout, `inch ${inch}`).toBeLessThan(wager * 25n);
    }
  });
});

describeLive('the reserve is taken once and released never (I7)', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('onSessionStart takes the whole 24x up front', async () => {
    for (const wager of STAKES) {
      const r = await read<{ reservedProfitDelta: bigint; requestRandomnessNow: boolean; nextPhase: number; newGameState: string; escrowDelta: bigint; payout: bigint }>('onSessionStart', [makeCtx({ wagerBase: wager })]);
      expect(r.reservedProfitDelta, `wager ${wager}`).toBe(payoutBase(wager, MAX_FACE_BP, 1) - wager);
      expect(r.reservedProfitDelta).toBe(wager * 24n);
      expect(r.escrowDelta).toBe(0n);
      expect(r.payout).toBe(0n);
      expect(r.requestRandomnessNow).toBe(true);
      expect(r.nextPhase, 'WAITING_RANDOMNESS').toBe(1);
      expect(decodeGameState(r.newGameState)).toEqual({ inch: 1, faceBp: 0, hasLot: false });
    }
  });

  it('every later step returns a delta of zero', async () => {
    const wager = 10n ** 20n;
    for (let inch = 1; inch <= INCHES; inch++) {
      const offered = makeCtx({ wagerBase: wager, gameState: encodeGameState(inch, 200, true) });
      const claim = await read<{ reservedProfitDelta: bigint }>('onPlayerAction', [offered, '0x00']);
      expect(claim.reservedProfitDelta, `CLAIM at inch ${inch}`).toBe(0n);

      const waiting = makeCtx({ wagerBase: wager, gameState: encodeGameState(inch, 0, false) });
      const rnd = await read<{ reservedProfitDelta: bigint }>('onRandomness', [waiting, `0x${'44'.repeat(32)}`]);
      expect(rnd.reservedProfitDelta, `onRandomness at inch ${inch}`).toBe(0n);

      if (inch < INCHES) {
        const burn = await read<{ reservedProfitDelta: bigint }>('onPlayerAction', [offered, '0x01']);
        expect(burn.reservedProfitDelta, `BURN at inch ${inch}`).toBe(0n);
      }
    }
  });

  it('I6 — onSessionStart is a pure function of the wager, so the double-call is safe', async () => {
    const wager = 10n ** 20n;
    // Production calls it twice, the first time as a simulation with sessionId 0.
    const simulated = await read<Record<string, unknown>>('onSessionStart', [makeCtx({ wagerBase: wager, sessionId: 0n })]);
    const real = await read<Record<string, unknown>>('onSessionStart', [makeCtx({ wagerBase: wager, sessionId: 42n })]);
    expect(simulated).toEqual(real);
  });

  it('refuses a zero wager rather than opening an unbacked session', async () => {
    await expect(read('onSessionStart', [makeCtx({ wagerBase: 0n })])).rejects.toThrow();
  });
});

describeLive('quoteRiskParams is honest about the tail', () => {
  let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
  beforeAll(() => {
    const client = publicClient(deployment as Deployment);
    read = (fn, args) =>
      client.readContract({ address: address as `0x${string}`, abi: candleAbi, functionName: fn as never, args: args as never }) as never;
  });

  it('probabilityWad is the TOP TIER only, not "any win"', async () => {
    const [, probabilityWad] = await read<[bigint, bigint, bigint, bigint]>('quoteRiskParams', [10n ** 20n, '0x']);
    expect(probabilityWad).toBe((BigInt(TOP_TIER_WEIGHT) * 10n ** 18n) / BigInt(WEIGHT_DENOM));
    expect(probabilityWad).toBe(2_000_000_000_000_000n); // 0.20%
    expect(probabilityWad).toBeLessThanOrEqual(10n ** 18n); // else InvalidRiskProbability
  });

  it('expectedPayout is quoted at the optimal-play RTP — the vault-honest worst case', async () => {
    for (const wager of STAKES) {
      const [, , expectedPayout] = await read<[bigint, bigint, bigint, bigint]>('quoteRiskParams', [wager, '0x']);
      expect(expectedPayout, `wager ${wager}`).toBe((wager * solution.rtp.n) / solution.rtp.d);
    }
  });

  it('CANDLE is not heavy-tailed, so the tiered jackpot path never engages', async () => {
    const wager = 10n ** 20n;
    const [maxPayout, probabilityWad, , subJackpotVarianceScaled] = await read<[bigint, bigint, bigint, bigint]>('quoteRiskParams', [wager, '0x']);
    // isHeavyTail needs maxPayout/wager > 100 AND probabilityWad < 1e15. Both fail.
    expect(maxPayout / wager).toBe(25n);
    expect(maxPayout / wager).toBeLessThanOrEqual(100n);
    expect(probabilityWad).toBeGreaterThanOrEqual(10n ** 15n);
    expect(subJackpotVarianceScaled).toBe(0n);
  });

  it('maxPayout agrees with quoteCaps — one payout rule, one truth', async () => {
    for (const wager of STAKES) {
      const [maxPayout] = await read<[bigint, bigint, bigint, bigint]>('quoteRiskParams', [wager, '0x']);
      const [maxEscrowStake, maxReservedProfit] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      expect(maxPayout, `wager ${wager}`).toBe(maxEscrowStake + maxReservedProfit);
    }
  });
});
