/**
 * I11 for THE SURVEY — the TS core and the deployed Solidity agree.
 *
 * The sharp end here is not the payout arithmetic (though that is checked on
 * every reachable state): it is the **belief**. Both sides must draw a report
 * from the same predictive distribution and resolve the voyage from the same
 * posterior, or the client is animating a different game from the one that
 * settles.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { keccak256 } from 'viem';
import { surveyAddress, chainIsUp, loadDeployment, publicClient, surveyAbi, makeCtx, encodeSurveyState, decodeSurveyState, type Deployment } from './helpers/chain';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, MAX_VALUE_BP, payoutBase, premiumBpAt } from '../src/games/survey/core/vessel';
import { posteriorSound, predictiveSound, isReachable } from '../src/games/survey/core/belief';
import { drawReport, drawCondition, drawCargo } from '../src/games/survey/core/draw';
import { wordToBytes, wordFromBytes, type Rehash } from '../src/shared/rng';
import { solve } from '../src/games/survey/core/solve';
import * as R from '../src/shared/math/rational';

const address = surveyAddress();
const deployment = loadDeployment();
const live = address !== null && deployment !== null && (await chainIsUp(deployment));
const describeLive = live ? describe : describe.skip;
if (!live) console.warn('\n  survey parity: no local chain — run `npm run sdk:stack`. SKIPPING.\n');

const keccakRehash: Rehash = w => wordFromBytes(wordToBytes(BigInt(keccak256(wordToBytes(w)))));
const STAKE = 10n ** 20n;
const PHASE_CARGO = 0, PHASE_WEIGHING = 1, PHASE_COMMITTED = 2;
const SURVEY = '0x00' as const, UNDERWRITE = '0x01' as const, DECLINE = '0x02' as const;

let read: <T>(fn: string, args: readonly unknown[]) => Promise<T>;
const connect = () => {
  const client = publicClient(deployment as Deployment);
  read = (fn, args) =>
    client.readContract({ address: address as `0x${string}`, abi: surveyAbi, functionName: fn as never, args: args as never }) as never;
};

describeLive('the manifest draw', () => {
  beforeAll(connect);

  it('draws the same cargo as the TS core, over a 1,024-word corpus', async () => {
    let word = 0x1728n;
    const batch: Promise<void>[] = [];
    for (let i = 0; i < 1024; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
      const expected = drawCargo(word, 0, keccakRehash).cargo;
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(0, 0, 0, PHASE_CARGO) });
      batch.push(
        read<{ newGameState: string }>('onRandomness', [ctx, hex]).then(result => {
          expect(decodeSurveyState(result.newGameState).valueBp, `word ${hex}`).toBe(expected.valueBp);
        }),
      );
      if (batch.length >= 64) await Promise.all(batch.splice(0, batch.length));
    }
    await Promise.all(batch);
  }, 120_000);

  it('only ever produces a cargo from the manifest', async () => {
    const values = new Set(CARGOES.map(c => c.valueBp));
    let word = 99n;
    for (let i = 0; i < 64; i++) {
      word = BigInt(keccak256(wordToBytes(word)));
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(0, 0, 0, PHASE_CARGO) });
      const r = await read<{ newGameState: string }>('onRandomness', [ctx, `0x${word.toString(16).padStart(64, '0')}`]);
      expect(values.has(decodeSurveyState(r.newGameState).valueBp)).toBe(true);
    }
  }, 60_000);
});

describeLive('the belief — reports and the voyage', () => {
  beforeAll(connect);

  it('draws the same report as the TS core, at every reachable margin', async () => {
    const cargo = CARGOES[2]!;
    for (let surveys = 0; surveys < MAX_SURVEYS; surveys++) {
      for (let margin = -surveys; margin <= surveys; margin += 2) {
        if (!isReachable(surveys, margin)) continue;
        let word = BigInt(0x5175 + surveys * 31 + margin * 7);
        for (let i = 0; i < 12; i++) {
          word = BigInt(keccak256(wordToBytes(word)));
          const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
          const expected = drawReport(margin, word, 0, keccakRehash).report;
          const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(cargo.valueBp, surveys, margin, PHASE_WEIGHING) });
          const r = await read<{ newGameState: string }>('onRandomness', [ctx, hex]);
          const next = decodeSurveyState(r.newGameState);
          expect(next.surveys, 'one more report').toBe(surveys + 1);
          expect(next.margin, `report at (${surveys}, ${margin}) word ${hex}`).toBe(margin + (expected === 'SOUND' ? 1 : -1));
        }
      }
    }
  }, 180_000);

  it('resolves the voyage exactly as the TS core does', async () => {
    const cargo = CARGOES[3]!;
    for (let surveys = 0; surveys <= MAX_SURVEYS; surveys++) {
      for (let margin = -surveys; margin <= surveys; margin += 2) {
        if (!isReachable(surveys, margin)) continue;
        let word = BigInt(0xc0de + surveys * 17 + margin * 5);
        for (let i = 0; i < 8; i++) {
          word = BigInt(keccak256(wordToBytes(word)));
          const hex = `0x${word.toString(16).padStart(64, '0')}` as const;
          const expected = drawCondition(margin, word, 0, keccakRehash).isSound;
          const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(cargo.valueBp, surveys, margin, PHASE_COMMITTED) });
          const r = await read<{ payout: bigint; nextPhase: number }>('onRandomness', [ctx, hex]);
          expect(r.nextPhase, 'SETTLED').toBe(3);
          expect(r.payout, `resolve at (${surveys}, ${margin})`).toBe(expected ? payoutBase(STAKE, cargo.valueBp, surveys) : 0n);
        }
      }
    }
  }, 180_000);
});

describeLive('the payouts, on every reachable state', () => {
  beforeAll(connect);

  it('declining pays the premium share, whatever she was', async () => {
    for (let surveys = 0; surveys <= MAX_SURVEYS; surveys++) {
      for (const cargo of CARGOES) {
        const margin = surveys % 2 === 0 ? 0 : 1;
        const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(cargo.valueBp, surveys, margin, PHASE_WEIGHING) });
        const r = await read<{ payout: bigint; nextPhase: number; requestRandomnessNow: boolean }>('onPlayerAction', [ctx, DECLINE]);
        expect(r.payout, `decline after ${surveys}`).toBe(payoutBase(STAKE, DECLINE_BP, surveys));
        expect(r.nextPhase, 'settles at once').toBe(3);
        expect(r.requestRandomnessNow, 'and never waits on a word').toBe(false);
      }
    }
  }, 60_000);

  it('underwriting commits without paying, then resolves', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(250, 2, 0, PHASE_WEIGHING) });
    const r = await read<{ payout: bigint; nextPhase: number; requestRandomnessNow: boolean; newGameState: string }>('onPlayerAction', [ctx, UNDERWRITE]);
    expect(r.payout).toBe(0n);
    expect(r.nextPhase, 'WAITING_RANDOMNESS').toBe(1);
    expect(r.requestRandomnessNow).toBe(true);
    expect(decodeSurveyState(r.newGameState).phase).toBe(PHASE_COMMITTED);
  });

  it('floors identically on an awkward stake', async () => {
    // A real cargo, and a margin with the right parity: every report moves the
    // margin by one, so after an odd number of them it cannot be zero.
    for (const stake of [1n, 7n, 999n, 10n ** 18n + 1n]) {
      for (let surveys = 0; surveys <= MAX_SURVEYS; surveys++) {
        const margin = surveys % 2;
        const ctx = makeCtx({ wagerBase: stake, escrowedStake: stake, reservedProfit: stake * 19n, gameState: encodeSurveyState(180, surveys, margin, PHASE_WEIGHING) });
        const r = await read<{ payout: bigint }>('onPlayerAction', [ctx, DECLINE]);
        expect(r.payout, `stake ${stake}, ${surveys} surveys`).toBe(payoutBase(stake, DECLINE_BP, surveys));
      }
    }
  }, 60_000);
});

describeLive('the caps', () => {
  beforeAll(connect);

  it('reserves exactly the richest voyage, with no slack', async () => {
    for (const wager of [1n, 1_000n, 10n ** 20n]) {
      const [maxEscrow, maxReserved] = await read<[bigint, bigint]>('quoteCaps', [wager, '0x']);
      expect(maxEscrow).toBe(wager);
      expect(maxEscrow + maxReserved).toBe(payoutBase(wager, MAX_VALUE_BP, 0));
      expect(maxEscrow + maxReserved).toBe(wager * 20n);
    }
  });

  it('quotes the declared RTP as the expected payout', async () => {
    const wager = 10n ** 20n;
    const [, probabilityWad, expectedPayout, subVariance] = await read<[bigint, bigint, bigint, bigint]>('quoteRiskParams', [wager, '0x']);
    const rtp = solve().rtp;
    expect(expectedPayout).toBe((wager * rtp.n) / rtp.d);
    // P(Indigo) x P(sound at the prior) = 0.02 x 0.4 = 0.8%
    expect(probabilityWad).toBe(8_000_000_000_000_000n);
    expect(subVariance).toBe(0n);
  });

  it('takes the whole reserve once, at the start, and never releases it', async () => {
    const wager = 10n ** 20n;
    const start = await read<{ reservedProfitDelta: bigint }>('onSessionStart', [makeCtx({ wagerBase: wager })]);
    expect(start.reservedProfitDelta).toBe(wager * 19n);
    for (let surveys = 0; surveys <= MAX_SURVEYS; surveys++) {
      const ctx = makeCtx({ wagerBase: wager, gameState: encodeSurveyState(180, surveys, surveys % 2, PHASE_WEIGHING) });
      const r = await read<{ reservedProfitDelta: bigint }>('onPlayerAction', [ctx, DECLINE]);
      expect(r.reservedProfitDelta, `after ${surveys} surveys`).toBe(0n);
    }
  });
});

describeLive('what the contract refuses', () => {
  beforeAll(connect);

  it('refuses a sixth surveyor', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(180, MAX_SURVEYS, 1, PHASE_WEIGHING) });
    await expect(read('onPlayerAction', [ctx, SURVEY])).rejects.toThrow();
  });

  it('refuses a margin that cannot have been reached', async () => {
    // |margin| > surveys, and margins whose parity does not match the count.
    for (const [surveys, margin] of [[1, 2], [2, 3], [0, 1], [2, 1], [3, 0], [4, 5]] as const) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(180, surveys, margin, PHASE_WEIGHING) });
      await expect(read('quoteForfeitPayout', [ctx]), `(${surveys}, ${margin})`).rejects.toThrow();
    }
  });

  it('refuses a cargo the manifest never issued', async () => {
    for (const valueBp of [1, 111, 199, 501, 1999, 0xffff]) {
      const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(valueBp, 2, 0, PHASE_WEIGHING) });
      await expect(read('onPlayerAction', [ctx, DECLINE]), `valueBp ${valueBp}`).rejects.toThrow();
    }
  });

  it('refuses an unknown action and an empty one', async () => {
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(180, 1, 1, PHASE_WEIGHING) });
    for (const action of ['0x03', '0xff', '0x']) {
      await expect(read('onPlayerAction', [ctx, action]), action).rejects.toThrow();
    }
  });

  it('refuses to act on a committed or unopened round', async () => {
    for (const phase of [PHASE_CARGO, PHASE_COMMITTED]) {
      const state = phase === PHASE_CARGO ? encodeSurveyState(0, 0, 0, phase) : encodeSurveyState(180, 2, 0, phase);
      const ctx = makeCtx({ wagerBase: STAKE, gameState: state });
      await expect(read('onPlayerAction', [ctx, DECLINE]), `phase ${phase}`).rejects.toThrow();
    }
  });

  it('quotes nothing for an abandoned session that is not weighing', async () => {
    for (const phase of [PHASE_CARGO, PHASE_COMMITTED]) {
      const state = phase === PHASE_CARGO ? encodeSurveyState(0, 0, 0, phase) : encodeSurveyState(180, 2, 0, phase);
      expect(await read<bigint>('quoteForfeitPayout', [makeCtx({ wagerBase: STAKE, gameState: state })])).toBe(0n);
    }
  });

  it('never quotes the underwrite value for a forfeit — that turns on an undrawn word', async () => {
    const cargo = CARGOES[5]!;
    const ctx = makeCtx({ wagerBase: STAKE, gameState: encodeSurveyState(cargo.valueBp, 1, 1, PHASE_WEIGHING) });
    const quote = await read<bigint>('quoteForfeitPayout', [ctx]);
    expect(quote).toBe(payoutBase(STAKE, DECLINE_BP, 1));
    expect(quote).toBeLessThan(payoutBase(STAKE, cargo.valueBp, 1));
  });

  it('refuses a zero wager', async () => {
    await expect(read('onSessionStart', [makeCtx({ wagerBase: 0n })])).rejects.toThrow();
  });
});

describe('the belief model itself', () => {
  it('is a proper probability at every reachable margin', () => {
    for (let m = -MAX_SURVEYS; m <= MAX_SURVEYS; m++) {
      for (const p of [posteriorSound(m), predictiveSound(m)]) {
        expect(R.compare(p, R.rat(0n)), `margin ${m}`).toBeGreaterThan(0);
        expect(R.compare(p, R.rat(1n)), `margin ${m}`).toBeLessThan(0);
      }
    }
  });

  it('the premium only ever falls', () => {
    for (let k = 0; k < MAX_SURVEYS; k++) expect(premiumBpAt(k + 1)).toBeLessThan(premiumBpAt(k));
  });
});
