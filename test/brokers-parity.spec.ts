/**
 * I11 for THE BROKERS — the TS core and the deployed Solidity agree.
 *
 * Three things are checked against the chain: the draws (every table, over a
 * corpus of words), the arithmetic (the payout on every reachable mask, and the
 * caps), and what the contract REFUSES — a price nobody names, a mask that could
 * not have been built, a second look from a man already paid.
 *
 * These SKIP rather than fail when there is no local chain. A missing simulator
 * is an environment gap, not a defect.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { keccak256 } from 'viem';
import {
  brokersAddress,
  chainIsUp,
  loadDeployment,
  publicClient,
  brokersAbi,
  makeCtx,
  encodeBrokersState,
  decodeBrokersState,
  type Deployment,
} from './helpers/chain';
import {
  BROKER_LIST,
  HOUSE,
  MAX_PAYOUT_BP,
  PRICE_DENOM,
  TOTAL_FEES_BP,
  feesForMask,
  payoutBase,
} from '../src/games/brokers/core/market';
import { drawHousePrice, drawQuote } from '../src/games/brokers/core/draw';
import { wordToBytes, wordFromBytes, type Rehash } from '../src/shared/rng';
import { solve } from '../src/games/brokers/core/solve';

const address = brokersAddress();
const deployment = loadDeployment();
const live = address !== null && deployment !== null && (await chainIsUp(deployment));
const describeLive = live ? describe : describe.skip;
if (!live) console.warn('\n  brokers parity: no local chain — run `npm run sdk:stack`. SKIPPING.\n');

const keccakRehash: Rehash = w => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(w)))));
const STAKE = 10n ** 20n;
const PHASE_OPENING = 0;
const PHASE_SHOPPING = 1;
const NOBODY = 0xff;
const TAKE = '0x04' as const;
const ask = (id: number) => `0x0${id}` as const;

let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
const connect = () => {
  const client = publicClient(deployment as Deployment);
  read = (fn, args) =>
    client.readContract({ address: address as `0x${string}`, abi: brokersAbi, functionName: fn as never, args: args as never }) as never;
};

describeLive("the house's opening price", () => {
  beforeAll(connect);

  it('draws the same price as the TS core, over a 512-word corpus', async () => {
    let word = 0x1728n;
    const batch: Promise<void>[] = [];
    for (let i = 0; i < 512; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
      const expected = drawHousePrice(word, 0, keccakRehash).priceBp;
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(0, 0, NOBODY, PHASE_OPENING) });
      batch.push(
        read<{ newGameState: string }>('onRandomness', [ctx, hex]).then(result => {
          expect(decodeBrokersState(result.newGameState).bestBp, `word ${hex}`).toBe(expected);
        }),
      );
      if (batch.length >= 64) await Promise.all(batch.splice(0, batch.length));
    }
    await Promise.all(batch);
  }, 120_000);

  it('and only ever names a price the house actually offers', async () => {
    const allowed = new Set(HOUSE.map(q => q.priceBp));
    let word = 77n;
    for (let i = 0; i < 48; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(0, 0, NOBODY, PHASE_OPENING) });
      const r = await read<{ newGameState: string }>('onRandomness', [ctx, `0x${word.toString(16).padStart(64, '0')}`]);
      expect(allowed.has(decodeBrokersState(r.newGameState).bestBp)).toBe(true);
    }
  }, 60_000);
});

describeLive('what each broker names', () => {
  beforeAll(connect);

  it('matches the TS core for every broker, over a corpus', async () => {
    for (const broker of BROKER_LIST) {
      let word = BigInt(0x5175 + broker.id * 977);
      const batch: Promise<void>[] = [];
      for (let i = 0; i < 128; i++) {
        word = BigInt(keccak256(wordToBytes(word)));
        const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
        const expected = drawQuote(broker.id, word, 0, keccakRehash).priceBp;
        // He has been asked — his bit is set and he is the one pending.
        const ctx = makeCtx({
          wagerBase: STAKE,
          gameState: encodeBrokersState(8_500, 1 << broker.id, broker.id, PHASE_SHOPPING),
        });
        batch.push(
          read<{ newGameState: string }>('onRandomness', [ctx, hex]).then(result => {
            const state = decodeBrokersState(result.newGameState);
            // Recall: what comes back is the BEST of the two, not his price.
            expect(state.bestBp, `${broker.name} on ${hex}`).toBe(Math.max(expected, 8_500));
            expect(state.pending, 'and nobody is left looking').toBe(NOBODY);
          }),
        );
        if (batch.length >= 64) await Promise.all(batch.splice(0, batch.length));
      }
      await Promise.all(batch);
    }
  }, 180_000);

  it('keeps the better price in hand when he names something worse', async () => {
    const broker = BROKER_LIST[3]!; // names 0.35x nine times in ten
    const word = BigInt(keccak256(wordToBytes(3n)));
    const ctx = makeCtx({
      wagerBase: STAKE,
      gameState: encodeBrokersState(10_200, 1 << broker.id, broker.id, PHASE_SHOPPING),
    });
    const r = await read<{ newGameState: string }>('onRandomness', [ctx, `0x${word.toString(16).padStart(64, '0')}`]);
    expect(decodeBrokersState(r.newGameState).bestBp).toBeGreaterThanOrEqual(10_200);
  });
});

describeLive('the payouts, on every reachable mask', () => {
  beforeAll(connect);

  it('pays what is in hand less what the day has cost', async () => {
    for (let mask = 0; mask < 1 << BROKER_LIST.length; mask++) {
      for (const price of [8_500, 10_200, 12_500, 23_000, 50_000]) {
        const ctx = makeCtx({
          wagerBase: STAKE,
          escrowedStake: STAKE,
          gameState: encodeBrokersState(price, mask, NOBODY, PHASE_SHOPPING),
        });
        const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, TAKE]);
        expect(r.payout, `mask ${mask} at ${price}`).toBe(payoutBase(STAKE, price, feesForMask(mask)));
      }
    }
  }, 120_000);

  it('floors identically on an awkward stake', async () => {
    const awkward = 123_456_789_987_654_321n;
    const ctx = makeCtx({
      wagerBase: awkward,
      escrowedStake: awkward,
      gameState: encodeBrokersState(10_200, 0b0101, NOBODY, PHASE_SHOPPING),
    });
    const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, TAKE]);
    expect(r.payout).toBe(payoutBase(awkward, 10_200, feesForMask(0b0101)));
  });

  it('and a forfeited session is worth exactly what selling would have been', async () => {
    const ctx = makeCtx({
      wagerBase: STAKE,
      escrowedStake: STAKE,
      gameState: encodeBrokersState(12_500, 0b1010, NOBODY, PHASE_SHOPPING),
    });
    const quoted = await read<bigint>('quoteForfeitPayout', [ctx]);
    expect(quoted).toBe(payoutBase(STAKE, 12_500, feesForMask(0b1010)));
  });
});

describeLive('the caps', () => {
  beforeAll(connect);

  it('reserves the best price less the one fee that buys it, with no slack', async () => {
    for (const wager of [1n, 1_000n, 10n ** 20n]) {
      const [maxEscrow, maxReserved] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      expect(maxEscrow).toBe(wager);
      expect(maxEscrow + maxReserved).toBe((wager * BigInt(MAX_PAYOUT_BP)) / BigInt(PRICE_DENOM));
    }
  });

  it('quotes the declared RTP as the expected payout', async () => {
    const wager = 10n ** 20n;
    const [, probabilityWad, expectedPayout, subVariance] = await read<[bigint, bigint, bigint, bigint]>(
      'quoteRiskParams',
      [wager, '0x'],
    );
    const rtp = solve().rtp;
    expect(expectedPayout).toBe((wager * rtp.n) / rtp.d);
    expect(probabilityWad).toBe(2_500_000_000_000_000n); // 0.25%, the top tier only
    expect(subVariance).toBe(0n);
  });

  it('takes the whole reserve once, at the start, and never releases it', async () => {
    const wager = 10n ** 20n;
    const start = await read<{ reservedProfitDelta: bigint }>('onSessionStart', [makeCtx({ wagerBase: wager })]);
    const top = (wager * BigInt(MAX_PAYOUT_BP)) / BigInt(PRICE_DENOM);
    expect(start.reservedProfitDelta).toBe(top - wager);

    for (let mask = 0; mask < 1 << BROKER_LIST.length; mask++) {
      const ctx = makeCtx({ wagerBase: wager, escrowedStake: wager, gameState: encodeBrokersState(10_200, mask, NOBODY, PHASE_SHOPPING) });
      const r = await read<{ reservedProfitDelta: bigint }>('onPlayerAction', [ctx, TAKE]);
      expect(r.reservedProfitDelta, `mask ${mask}`).toBe(0n);
    }
  }, 60_000);
});

describeLive('what the contract refuses', () => {
  beforeAll(connect);

  const rejects = async (fn: string, args: readonly unknown[]) => {
    await expect(read(fn, args)).rejects.toThrow();
  };

  it('a second look from a man already paid', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0b0001, NOBODY, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, ask(0)]);
  });

  it('a broker who does not exist', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0, NOBODY, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, '0x05']);
    await rejects('onPlayerAction', [ctx, '0xff']);
  });

  it('an empty action', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0, NOBODY, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, '0x']);
  });

  it('a price nobody on this floor names', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(9_999, 0, NOBODY, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, TAKE]);
  });

  it('a mask with a bit for a fifth broker', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0b10000, NOBODY, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, TAKE]);
  });

  it('a man pending who was never asked', async () => {
    // `pending` has to be inside the mask: the ask and the fee are one event.
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0b0001, 2, PHASE_SHOPPING) });
    await rejects('onRandomness', [ctx, `0x${'11'.repeat(32)}`]);
  });

  it('acting while a man is still looking', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0b0001, 0, PHASE_SHOPPING) });
    await rejects('onPlayerAction', [ctx, TAKE]);
  });

  it('an opening state that claims to hold a price or owe a fee', async () => {
    await rejects('onPlayerAction', [
      makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0, NOBODY, PHASE_OPENING) }),
      TAKE,
    ]);
    await rejects('onRandomness', [
      makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(0, 0b0001, NOBODY, PHASE_OPENING) }),
      `0x${'22'.repeat(32)}`,
    ]);
  });

  it('a gameState of the wrong length, and a phase that does not exist', async () => {
    await rejects('onPlayerAction', [makeCtx({ wagerBase: STAKE, gameState: '0x00000000' }), TAKE]);
    await rejects('onPlayerAction', [
      makeCtx({ wagerBase: STAKE, gameState: encodeBrokersState(8_500, 0, NOBODY, 7) }),
      TAKE,
    ]);
  });

  it('a zero wager', async () => {
    await rejects('onSessionStart', [makeCtx({ wagerBase: 0n })]);
  });
});

describeLive('the fees, as the contract computes them', () => {
  beforeAll(connect);

  it('agree with the TS mirror on every mask', async () => {
    // Read them out through the payout: a price of exactly the total fees pays
    // nothing, and a basis point more pays a basis point.
    for (let mask = 0; mask < 1 << BROKER_LIST.length; mask++) {
      const fees = feesForMask(mask);
      const ctx = makeCtx({
        wagerBase: STAKE,
        escrowedStake: STAKE,
        gameState: encodeBrokersState(10_200, mask, NOBODY, PHASE_SHOPPING),
      });
      const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, TAKE]);
      expect(r.payout, `mask ${mask}`).toBe((STAKE * BigInt(10_200 - fees)) / BigInt(PRICE_DENOM));
    }
    expect(feesForMask(0b1111)).toBe(TOTAL_FEES_BP);
  }, 60_000);
});
