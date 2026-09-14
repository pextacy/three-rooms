/**
 * The phase-1 exit gate (phases.md): a REAL round settles in the simulator.
 * Stake in, three inches burned, claim at the fourth, payout correct to the
 * base unit.
 *
 * It imports the pure core directly and checks the chain's answer against it,
 * so this is also the first live proof of I11 — contract math and client math
 * agreeing bit for bit.
 *
 *   npm run sdk:stack      # in another terminal
 *   npm run round-trip
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { lotById, type LotId } from '../src/game/paytable';
import { payoutBase } from '../src/game/wax';
import { lightCandle, transition, payoutIfClaimedNow, type RoundState } from '../src/game/round';

const deployed = JSON.parse(
  readFileSync(new URL('../sdk/casino-sdk/simulator/local-node/deployed.json', import.meta.url), 'utf8'),
) as {
  chainId: number;
  rpcUrl: string;
  host: `0x${string}`;
  vault: `0x${string}`;
  token: `0x${string}`;
  games: Array<{ name: string; address: `0x${string}` }>;
};

const game = deployed.games.find(g => g.name === 'CandleGame');
if (!game) throw new Error('CandleGame not deployed — copy contracts/ into the simulator and wait a beat');

const chain = {
  id: deployed.chainId,
  name: 'local',
  nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 },
  rpcUrls: { default: { http: [deployed.rpcUrl] } },
} as const;
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const pub = createPublicClient({ chain, transport: http(deployed.rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(deployed.rpcUrl) });

const hostAbi = [
  { type: 'function', name: 'openSession', stateMutability: 'nonpayable', inputs: [{ name: 'game', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'sessionId', type: 'uint256' }, { name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'submitAction', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }, { name: 'actionData', type: 'bytes' }], outputs: [{ name: 'requestId', type: 'bytes32' }] },
  { type: 'event', name: 'CasinoSessionAdvanced', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'step', type: 'uint32', indexed: true }, { name: 'requestId', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' }, { name: 'session', type: 'bytes' }] },
  { type: 'event', name: 'CasinoSessionSettled', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'game', type: 'address', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'phase', type: 'uint8' }, { name: 'payout', type: 'uint256' }, { name: 'randomness', type: 'bytes32' }, { name: 'gameState', type: 'bytes' }] },
] as const;
const tokenAbi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

type Args = Record<string, unknown>;
const logsOf = (
  receipt: { logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[] },
  name: string,
): Args[] => {
  const out: Args[] = [];
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: hostAbi, data: log.data, topics: log.topics as never });
      if (decoded.eventName === name) out.push(decoded.args as unknown as Args);
    } catch {
      // A log from the token or the VRF router — not ours to decode.
    }
  }
  return out;
};

const send = async (fn: 'openSession' | 'submitAction', args: readonly unknown[]) =>
  pub.waitForTransactionReceipt({
    hash: await wallet.writeContract({ address: deployed.host, abi: hostAbi, functionName: fn, args: args as never, chain, account }),
  });

/** gameState is the last 4 bytes of the encoded session: inch, faceBp, hasLot. */
const decodeGameState = (encodedSession: string) => {
  const tail = encodedSession.slice(-8);
  return {
    inch: parseInt(tail.slice(0, 2), 16),
    faceBp: parseInt(tail.slice(2, 6), 16),
    hasLot: parseInt(tail.slice(6, 8), 16) === 1,
  };
};

const eventNamed = (name: string) => {
  const found = hostAbi.find(e => e.type === 'event' && e.name === name);
  if (!found) throw new Error(`no ${name} event in the host ABI`);
  return found;
};
const advancedEvent = eventNamed('CasinoSessionAdvanced');
const settledEvent = eventNamed('CasinoSessionSettled');

/** Polls until the session leaves the step it is on. The VRF node is async. */
const waitPastStep = async (
  sessionId: bigint,
  afterStep: number,
): Promise<{ advanced: Args } | { settled: Args }> => {
  const query = async (event: typeof advancedEvent): Promise<Args[]> => {
    const toBlock = await pub.getBlockNumber();
    const logs = await pub.getLogs({ address: deployed.host, event, args: { sessionId }, fromBlock: 0n, toBlock } as never);
    return (logs as unknown as { args: Args }[]).map(l => l.args);
  };

  for (let i = 0; i < 160; i++) {
    const settled = await query(settledEvent);
    const lastSettled = settled[settled.length - 1];
    if (lastSettled) return { settled: lastSettled };

    const advanced = await query(advancedEvent);
    const last = advanced[advanced.length - 1];
    if (last && Number(last['step']) > afterStep) return { advanced: last };

    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`session ${sessionId} never advanced past step ${afterStep}`);
};

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  ok ? pass++ : fail++;
};

const STAKE = parseEther('100');
const BURNS = 3;

console.log('\n\x1b[1mCANDLE — phase 1 exit gate\x1b[0m');
console.log(`\x1b[2mCandleGame ${game.address} · stake ${formatEther(STAKE)} chUSD · burn ${BURNS} inches, then claim\x1b[0m\n`);

const before = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
await pub.waitForTransactionReceipt({
  hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, STAKE * 200n], chain, account }),
});

/**
 * Burn three inches and claim the fourth. Retried until the claimed lot is
 * non-empty: a zero payout would pass "correct to the base unit" without
 * proving anything, and the whole point of this gate is the arithmetic.
 */
async function playRound() {
  const open = await send('openSession', [game!.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  if (!opened) throw new Error('no CasinoSessionAdvanced on openSession');
  const sessionId = opened['sessionId'] as bigint;

  let mirror: RoundState = lightCandle(STAKE); // the pure core, in lockstep
  let res = await waitPastStep(sessionId, Number(opened['step']));
  const seen: { inch: number; name: string; claimNow: bigint }[] = [];

  for (let burned = 0; burned < BURNS; burned++) {
    if ('settled' in res) throw new Error('settled below inch 5 — impossible');
    const encoded = res.advanced['session'] as string;
    const gs = decodeGameState(encoded);

    mirror = transition(mirror, { type: 'OFFER', lotId: lotFaceToId(gs.faceBp) });
    if (mirror.inch !== gs.inch || mirror.lot?.faceBp !== gs.faceBp) {
      throw new Error(`core/chain disagree at inch ${gs.inch}`);
    }
    seen.push({ inch: gs.inch, name: mirror.lot?.name ?? '?', claimNow: payoutIfClaimedNow(mirror) });

    const burn = await send('submitAction', [encoded, '0x01']);
    mirror = transition(mirror, { type: 'BURN' });
    res = await waitPastStep(sessionId, Number(logsOf(burn, 'CasinoSessionAdvanced')[0]?.['step']));
  }

  if ('settled' in res) throw new Error('settled during the burns');
  const encoded = res.advanced['session'] as string;
  const offer = decodeGameState(encoded);
  mirror = transition(mirror, { type: 'OFFER', lotId: lotFaceToId(offer.faceBp) });
  const expected = payoutIfClaimedNow(mirror);

  return { encoded, offer, mirror, expected, seen, sessionId };
}

let round = await playRound();
for (let attempt = 0; attempt < 40 && round.expected === 0n; attempt++) {
  round = await playRound();
}
if (round.expected === 0n) throw new Error('40 rounds without a claimable lot at the fourth inch');

for (const s of round.seen) {
  check(`inch ${s.inch}: chain and pure core agree on the lot`, true, `${s.name} — ${formatEther(s.claimNow)} if claimed now`);
}
check(`three inches burned, now at inch ${round.offer.inch}`, round.offer.inch === BURNS + 1, `wax 55% · ${round.mirror.lot?.name}`);

const claim = await send('submitAction', [round.encoded, '0x00']);
const mirrorSettled = transition(round.mirror, { type: 'CLAIM' });

const settled = logsOf(claim, 'CasinoSessionSettled')[0];
if (!settled) throw new Error('CLAIM did not settle the session');
const after = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
const onChain = settled['payout'] as bigint;

console.log('');
check('the session reached SETTLED', Number(settled['phase']) === 3);
check('the claimed lot is non-empty, so the arithmetic is actually exercised', round.expected > 0n, `${round.mirror.lot?.name}`);
check(
  'on-chain payout == the pure core, to the base unit',
  onChain === round.expected,
  `${onChain.toString()} wei = ${formatEther(onChain)} chUSD`,
);
check('the pure core agrees with its own payout rule', mirrorSettled.payoutBase === round.expected);
check(
  'payout == stake * faceBp * waxBp / 1e6',
  onChain === payoutBase(STAKE, round.offer.faceBp, round.offer.inch),
  `${formatEther(STAKE)} * ${round.offer.faceBp} * 5500 / 1e6`,
);
check('the vault settled the round (balance moved)', after !== before, `${formatEther(after - before)} chUSD net across ${1} claimed + retried rounds`);
check('the round settled as CLAIMED, not GUTTERED', mirrorSettled.phase === 'CLAIMED', 'claimed at the fourth inch');

function lotFaceToId(faceBp: number): LotId {
  for (let id = 0; id <= 5; id++) {
    if (lotById(id as LotId).faceBp === faceBp) return id as LotId;
  }
  throw new Error(`no lot with faceBp ${faceBp}`);
}

console.log(`\n${fail === 0 ? '\x1b[32mEXIT GATE GREEN\x1b[0m' : '\x1b[31mEXIT GATE RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
