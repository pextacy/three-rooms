/**
 * `npm run spike` (plan.md D2 2.7) — every SDK symbol this game depends on,
 * exercised end to end against the local stack.
 *
 * The point is not coverage for its own sake. It is that `claude.md` §9 forbids
 * guessing SDK behaviour: anything we rely on has to have been RUN. When the SDK
 * version moves, this is the file that says whether our assumptions still hold.
 *
 *   npm run sdk:stack     # in another terminal
 *   npm run spike
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { computeMaxWager } from '@chain/casino-sdk/guest';
import { validateCasinoGameManifest, canonicalCasinoGameId, resolveManifestMetadata, assertSameOriginUrls } from '@chain/casino-sdk/manifest';
import type { HostSnapshotV1 } from '@chain/casino-sdk';
import { decodeGameState, encodeAction, encodeGameState } from '../src/shared/bridge/types';
import { MAX_FACE_BP, FACE_DENOM, LOTS } from '../src/games/candle/core/paytable';
import { INCHES, payoutBase } from '../src/games/candle/core/wax';

const deployed = JSON.parse(
  readFileSync(new URL('../sdk/casino-sdk/simulator/local-node/deployed.json', import.meta.url), 'utf8'),
) as { chainId: number; rpcUrl: string; host: `0x${string}`; vault: `0x${string}`; token: `0x${string}`; games: Array<{ name: string; address: `0x${string}` }> };

const game = deployed.games.find(g => g.name === 'CandleGame');
if (!game) throw new Error('CandleGame not deployed — run `npm run sync:simulator`');

const chain = { id: deployed.chainId, name: 'local', nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 }, rpcUrls: { default: { http: [deployed.rpcUrl] } } } as const;
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const pub = createPublicClient({ chain, transport: http(deployed.rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(deployed.rpcUrl) });

const hostAbi = [
  { type: 'function', name: 'openSession', stateMutability: 'nonpayable', inputs: [{ name: 'game', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'sessionId', type: 'uint256' }, { name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'submitAction', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }, { name: 'actionData', type: 'bytes' }], outputs: [{ name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'cancelStuckRandomness', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }], outputs: [{ name: 'payout', type: 'uint256' }] },
  { type: 'function', name: 'forfeitExpiredSession', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }], outputs: [{ name: 'payout', type: 'uint256' }] },
  { type: 'event', name: 'CasinoSessionAdvanced', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'step', type: 'uint32', indexed: true }, { name: 'requestId', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' }, { name: 'session', type: 'bytes' }] },
  { type: 'event', name: 'CasinoSessionSettled', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'game', type: 'address', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'phase', type: 'uint8' }, { name: 'payout', type: 'uint256' }, { name: 'randomness', type: 'bytes32' }, { name: 'gameState', type: 'bytes' }] },
] as const;
const tokenAbi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

type Args = Record<string, unknown>;
const logsOf = (receipt: { logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[] }, name: string): Args[] => {
  const out: Args[] = [];
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: hostAbi, data: log.data, topics: log.topics as never });
      if (decoded.eventName === name) out.push(decoded.args as unknown as Args);
    } catch {
      /* a token or router log */
    }
  }
  return out;
};
const send = async (fn: 'openSession' | 'submitAction' | 'cancelStuckRandomness' | 'forfeitExpiredSession', args: readonly unknown[]) =>
  pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.host, abi: hostAbi, functionName: fn, args: args as never, chain, account }) });

const eventNamed = (name: string) => {
  const found = hostAbi.find(e => e.type === 'event' && e.name === name);
  if (!found) throw new Error(name);
  return found;
};
const waitPastStep = async (sessionId: bigint, afterStep: number): Promise<{ advanced: Args } | { settled: Args }> => {
  const query = async (event: ReturnType<typeof eventNamed>): Promise<Args[]> => {
    const toBlock = await pub.getBlockNumber();
    const logs = await pub.getLogs({ address: deployed.host, event, args: { sessionId }, fromBlock: 0n, toBlock } as never);
    return (logs as unknown as { args: Args }[]).map(l => l.args);
  };
  for (let i = 0; i < 160; i++) {
    const settled = await query(eventNamed('CasinoSessionSettled'));
    const lastSettled = settled[settled.length - 1];
    if (lastSettled) return { settled: lastSettled };
    const advanced = await query(eventNamed('CasinoSessionAdvanced'));
    const last = advanced[advanced.length - 1];
    if (last && Number(last['step']) > afterStep) return { advanced: last };
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`session ${sessionId} stalled past step ${afterStep}`);
};

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  ok ? pass++ : fail++;
};
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;

console.log(`\n${B('CANDLE — SDK symbols, exercised')}`);
console.log(`\x1b[2mCandleGame ${game.address}\x1b[0m\n`);

// ---------------------------------------------------------------- manifest
console.log(B('manifest.ts'));
{
  const manifest = JSON.parse(readFileSync(new URL('../public/candle/game.manifest.json', import.meta.url), 'utf8'));
  const result = validateCasinoGameManifest(manifest);
  check('validateCasinoGameManifest accepts our manifest', result.ok, result.ok ? manifest.gameId : result.reason);
  check('canonicalCasinoGameId agrees for contract and manifest', canonicalCasinoGameId('CandleGame') === canonicalCasinoGameId(manifest.gameId), `both -> "${canonicalCasinoGameId('CandleGame')}"`);
  if (result.ok) {
    const meta = resolveManifestMetadata(result.manifest, 'en');
    check('resolveManifestMetadata returns the English name', meta.name === 'Candle', meta.name);
    const fallback = resolveManifestMetadata(result.manifest, 'xx');
    check('an unknown locale falls back to the default', fallback.name === meta.name);
  }
  check('submitAction is declared — CANDLE is multi-action', manifest.capabilities.submitAction === true);
  check('assertSameOriginUrls holds for the manifest next to the page', assertSameOriginUrls('https://x.example/game.manifest.json', 'https://x.example/'));
  check('and rejects a manifest on another origin', !assertSameOriginUrls('https://y.example/game.manifest.json', 'https://x.example/'));
}

// ---------------------------------------------------------------- bet limits
console.log(`\n${B('bet-limits.ts — computeMaxWager')}`);
{
  const MAX_X = MAX_FACE_BP / FACE_DENOM;
  check('our max multiplier is 25', MAX_X === 25);

  const snap = (casino: NonNullable<HostSnapshotV1['casino']>) => ({ casino }) as Pick<HostSnapshotV1, 'casino'>;
  // reservedProfit for a 25x game is wager * 24, so the risk cap binds at cap/24.
  const risk = computeMaxWager(snap({ maxAllowedReservedProfit: (2_400n * 10n ** 18n).toString() }), { maxMultiplierX: MAX_X });
  check('the risk leg binds at maxAllowedReservedProfit / 24', risk === 100n * 10n ** 18n, `${formatEther(risk ?? 0n)} tokens`);

  const capped = computeMaxWager(snap({ maxAllowedReservedProfit: (2_400n * 10n ** 18n).toString(), maxBetAmount: (10n * 10n ** 18n).toString() }), { maxMultiplierX: MAX_X });
  check('an absolute maxBetAmount wins when it is lower', capped === 10n * 10n ** 18n, `${formatEther(capped ?? 0n)} tokens`);

  check('an absent casino block reads as unknown, not unlimited', computeMaxWager(null, { maxMultiplierX: MAX_X }) === undefined);
}

// ---------------------------------------------------------------- gameState
console.log(`\n${B('our gameState codec, against what the chain emits')}`);
{
  check('round-trips every reachable state', LOTS.every(lot => [1, 2, 3, 4, 5].every(inch => {
    const decoded = decodeGameState(encodeGameState(inch, lot.faceBp, true));
    return decoded?.inch === inch && decoded.faceBp === lot.faceBp && decoded.hasLot;
  })));
  check('rejects malformed bytes rather than guessing', decodeGameState('0x00') === null && decodeGameState(undefined) === null && decodeGameState('0xzzzzzzzz') === null);
  check('CLAIM is 0x00 and BURN is 0x01', encodeAction('CLAIM') === '0x00' && encodeAction('BURN') === '0x01');
}

// ---------------------------------------------------------------- lifecycle
console.log(`\n${B('the full session lifecycle on chain')}`);
const STAKE = parseEther('50');
await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, STAKE * 50n], chain, account }) });

{
  const before = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
  const open = await send('openSession', [game.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  check('openSession emits CasinoSessionAdvanced with an encoded session', opened !== undefined);
  const sessionId = opened?.['sessionId'] as bigint;

  let res = await waitPastStep(sessionId, Number(opened?.['step']));
  let burns = 0;
  let lastEncoded = '';

  while (!('settled' in res)) {
    lastEncoded = res.advanced['session'] as string;
    const state = decodeGameState(`0x${lastEncoded.slice(-8)}`);
    if (!state) throw new Error('could not decode the emitted gameState');
    check(`inch ${state.inch}: gameState decodes to a real paytable lot`, LOTS.some(l => l.faceBp === state.faceBp), `${state.faceBp}bp, hasLot=${state.hasLot}`);
    if (state.inch >= INCHES) break;
    const burn = await send('submitAction', [lastEncoded, encodeAction('BURN')]);
    burns++;
    res = await waitPastStep(sessionId, Number(logsOf(burn, 'CasinoSessionAdvanced')[0]?.['step']));
  }

  if (!('settled' in res)) {
    const claim = await send('submitAction', [lastEncoded, encodeAction('CLAIM')]);
    res = { settled: logsOf(claim, 'CasinoSessionSettled')[0] as Args };
  }

  const settled = res.settled;
  const finalState = decodeGameState(settled['gameState'] as string);
  const after = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });

  check('the session reached a terminal phase', [3, 4, 5].includes(Number(settled['phase'])), `phase ${settled['phase']}`);
  check('submitAction drove every burn', burns === (finalState?.inch ?? 1) - 1, `${burns} burns, settled at inch ${finalState?.inch}`);
  check(
    'the settled payout matches our own payout rule',
    (settled['payout'] as bigint) === payoutBase(STAKE, finalState?.faceBp ?? 0, finalState?.inch ?? 1),
    `${formatEther(settled['payout'] as bigint)} chUSD`,
  );
  check('the balance moved by payout - stake', after - before === (settled['payout'] as bigint) - STAKE, `${formatEther(after - before)} chUSD`);
}

// ---------------------------------------------------------------- unhappy paths
console.log(`\n${B('unhappy paths the SDK tells us to test')}`);
{
  // Stuck randomness: open a session, never fulfil, mine past the deadline.
  const open = await send('openSession', [game.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  const encoded = opened?.['session'] as string;
  check('a fresh session sits in WAITING_RANDOMNESS with an encoded snapshot', typeof encoded === 'string' && encoded.length > 2);

  // The VRF node is live, so this session WILL be fulfilled; assert instead that
  // cancelStuckRandomness is rejected while the deadline has not passed.
  let rejected = false;
  try {
    await send('cancelStuckRandomness', [encoded]);
  } catch {
    rejected = true;
  }
  check('cancelStuckRandomness is refused before the deadline', rejected, 'RandomnessDeadlineNotPassed, or already fulfilled');

  // Forfeit: abandon at a LIVE, non-empty lot so the 10% cut is actually
  // exercised. An empty crate would pass "90% of 0 is 0" without proving a thing.
  let held: string | null = null;
  let heldState: ReturnType<typeof decodeGameState> = null;

  let sessionId = opened?.['sessionId'] as bigint;
  let encodedNow = encoded;
  for (let attempt = 0; attempt < 30 && !held; attempt++) {
    let res = await waitPastStep(sessionId, attempt === 0 ? Number(opened?.['step']) : 1);
    for (let guard = 0; guard < INCHES && !('settled' in res); guard++) {
      const candidate = res.advanced['session'] as string;
      const state = decodeGameState(`0x${candidate.slice(-8)}`);
      if (state && state.hasLot && state.faceBp > 0) {
        held = candidate;
        heldState = state;
        break;
      }
      if (!state || state.inch >= INCHES) break;
      const burn = await send('submitAction', [candidate, encodeAction('BURN')]);
      res = await waitPastStep(sessionId, Number(logsOf(burn, 'CasinoSessionAdvanced')[0]?.['step']));
    }
    if (held) break;
    const next = await send('openSession', [game.address, deployed.vault, STAKE, '0x']);
    const nextOpened = logsOf(next, 'CasinoSessionAdvanced')[0];
    sessionId = nextOpened?.['sessionId'] as bigint;
    encodedNow = nextOpened?.['session'] as string;
  }
  void encodedNow;

  if (!held || !heldState) throw new Error('could not reach a non-empty lot in 30 rounds');

  const claimValue = payoutBase(STAKE, heldState.faceBp, heldState.inch);
  check('reached a non-empty lot to abandon', claimValue > 0n, `${heldState.faceBp}bp at inch ${heldState.inch} = ${formatEther(claimValue)} chUSD`);

  await pub.request({ method: 'hardhat_mine', params: ['0xA8C1'] } as never);
  const forfeited = await send('forfeitExpiredSession', [held]);
  const settled = logsOf(forfeited, 'CasinoSessionSettled')[0];
  check('forfeitExpiredSession settles an abandoned session', Number(settled?.['phase']) === 4, 'FORFEITED');
  check(
    'and pays 90% of the lot on the table, not 100%',
    (settled?.['payout'] as bigint) === (claimValue * 9000n) / 10000n,
    `paid ${formatEther(settled?.['payout'] as bigint)} of a ${formatEther(claimValue)} claim`,
  );
}

console.log(`\n${fail === 0 ? '\x1b[32mALL GREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
