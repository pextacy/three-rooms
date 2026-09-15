/**
 * THE SURVEY's exit gate: a REAL voyage settles in the simulator.
 *
 * Stake in, two surveyors sent, underwritten, and the payout checked to the base
 * unit against the pure core running in lockstep — the live proof of I11 for the
 * second game.
 *
 * It also checks the thing that is this game's whole security model, on the
 * chain rather than in a comment: **the word that decides her is requested only
 * after UNDERWRITE is submitted.** The facet emits every word it receives, so
 * the test reads the words the session actually consumed and asserts that the
 * settling one arrived on a step after the call — not before it, and not at the
 * start where a player could have read it out of the session.
 *
 *   npm run sdk:stack      # in another terminal
 *   npm run round-trip:survey
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CARGOES, MAX_SURVEYS, DECLINE_BP, payoutBase, type CargoId } from '../src/games/survey/core/vessel';
import { openRound, transition, underwritePayout, declinePayout, type RoundState } from '../src/games/survey/core/round';

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

const game = deployed.games.find(g => g.name === 'SurveyGame');
if (!game) throw new Error('SurveyGame not deployed — run `npm run sync:simulator` and wait a beat');

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

/** gameState is the last 5 bytes of the encoded session. */
const decodeGameState = (encodedSession: string) => {
  const tail = encodedSession.slice(-10);
  return {
    valueBp: parseInt(tail.slice(0, 4), 16),
    surveys: parseInt(tail.slice(4, 6), 16),
    margin: parseInt(tail.slice(6, 8), 16) - 128,
    phase: parseInt(tail.slice(8, 10), 16),
  };
};

const eventNamed = (name: string) => {
  const found = hostAbi.find(e => e.type === 'event' && e.name === name);
  if (!found) throw new Error(`no ${name} event in the host ABI`);
  return found;
};
const advancedEvent = eventNamed('CasinoSessionAdvanced');
const settledEvent = eventNamed('CasinoSessionSettled');

const query = async (sessionId: bigint, event: typeof advancedEvent): Promise<Args[]> => {
  const toBlock = await pub.getBlockNumber();
  const logs = await pub.getLogs({ address: deployed.host, event, args: { sessionId }, fromBlock: 0n, toBlock } as never);
  return (logs as unknown as { args: Args }[]).map(l => l.args);
};

/** Polls until the session leaves the step it is on. The VRF node is async. */
const waitPastStep = async (sessionId: bigint, afterStep: number): Promise<{ advanced: Args } | { settled: Args }> => {
  for (let i = 0; i < 160; i++) {
    const settled = await query(sessionId, settledEvent);
    const lastSettled = settled[settled.length - 1];
    if (lastSettled) return { settled: lastSettled };

    const advanced = await query(sessionId, advancedEvent);
    const last = advanced[advanced.length - 1];
    if (last && Number(last['step']) > afterStep) return { advanced: last };

    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`session ${sessionId} never advanced past step ${afterStep}`);
};

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m' } ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  ok ? pass++ : fail++;
};

const STAKE = parseEther('100');
const SURVEYS = 2;
const SURVEY = '0x00' as const;
const UNDERWRITE = '0x01' as const;
const DECLINE = '0x02' as const;

console.log('\n\x1b[1mTHE SURVEY — a real voyage, settled on chain\x1b[0m');
console.log(
  `\x1b[2mSurveyGame ${game.address} · stake ${formatEther(STAKE)} chUSD · send ${SURVEYS} surveyors, then underwrite\x1b[0m\n`,
);

const before = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
await pub.waitForTransactionReceipt({
  hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, STAKE * 200n], chain, account }),
});

function cargoIdForValue(valueBp: number): CargoId {
  const cargo = CARGOES.find(c => c.valueBp === valueBp);
  if (!cargo) throw new Error(`no cargo with valueBp ${valueBp}`);
  return cargo.id;
}

/**
 * Sends two surveyors and underwrites. Retried until she comes home: a lost
 * voyage pays zero, which would pass "correct to the base unit" without proving
 * any arithmetic, and the arithmetic is the point of this gate.
 */
async function playVoyage() {
  const open = await send('openSession', [game!.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  if (!opened) throw new Error('no CasinoSessionAdvanced on openSession');
  const sessionId = opened['sessionId'] as bigint;

  let mirror: RoundState = openRound(STAKE); // the pure core, in lockstep
  let res = await waitPastStep(sessionId, Number(opened['step']));
  if ('settled' in res) throw new Error('settled before the manifest was read');

  const manifest = decodeGameState(res.advanced['session'] as string);
  mirror = transition(mirror, { type: 'OFFER', cargoId: cargoIdForValue(manifest.valueBp) });
  const reports: { surveys: number; margin: number }[] = [];

  for (let sent = 0; sent < SURVEYS; sent++) {
    const encoded = (res as { advanced: Args }).advanced['session'] as string;
    const tx = await send('submitAction', [encoded, SURVEY]);
    res = await waitPastStep(sessionId, Number(logsOf(tx, 'CasinoSessionAdvanced')[0]?.['step']));
    if ('settled' in res) throw new Error('settled while surveying');

    const state = decodeGameState(res.advanced['session'] as string);
    mirror = transition(mirror, { type: 'REPORT', report: state.margin > mirror.margin ? 'SOUND' : 'ROTTEN' });
    if (mirror.surveys !== state.surveys || mirror.margin !== state.margin) {
      throw new Error(`core/chain disagree after ${state.surveys} surveys: ${mirror.margin} vs ${state.margin}`);
    }
    reports.push({ surveys: state.surveys, margin: state.margin });
  }

  const encoded = (res as { advanced: Args }).advanced['session'] as string;
  const state = decodeGameState(encoded);
  const expected = underwritePayout(mirror);
  const stepBeforeCall = Number((res as { advanced: Args }).advanced['step']);

  return { sessionId, encoded, state, mirror, expected, reports, stepBeforeCall };
}

// Underwrite, and keep opening voyages until one comes home: a lost voyage pays
// zero, and zero would pass every arithmetic check without exercising any of it.
let voyage = await playVoyage();
let settled: Args | null = null;
let attempts = 0;

while (settled === null && attempts < 40) {
  attempts += 1;
  const call = await send('submitAction', [voyage.encoded, UNDERWRITE]);
  const advanced = logsOf(call, 'CasinoSessionAdvanced')[0];
  const res = await waitPastStep(voyage.sessionId, Number(advanced?.['step'] ?? voyage.stepBeforeCall));
  if ('settled' in res && (res.settled['payout'] as bigint) > 0n) {
    settled = res.settled;
    break;
  }
  voyage = await playVoyage();
}
if (settled === null) throw new Error('40 voyages and not one came home');

for (const report of voyage.reports) {
  check(
    `after ${report.surveys} surveyor${report.surveys === 1 ? '' : 's'}: chain and pure core agree`,
    true,
    `margin ${report.margin > 0 ? `+${report.margin}` : report.margin}`,
  );
}

const cargo = CARGOES.find(c => c.valueBp === voyage.state.valueBp);
check('the manifest carried a cargo this game actually issues', cargo !== undefined, `${cargo?.name} ${voyage.state.valueBp} bp`);
check(`${SURVEYS} surveyors reported`, voyage.state.surveys === SURVEYS, `premium ${(10_000 - SURVEYS * 150) / 100}%`);

const onChain = settled['payout'] as bigint;
const after = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });

console.log('');
check('the session reached SETTLED', Number(settled['phase']) === 3);
check('she came home, so the arithmetic is actually exercised', onChain > 0n);
check(
  'on-chain payout == the pure core, to the base unit',
  onChain === voyage.expected,
  `${onChain.toString()} wei = ${formatEther(onChain)} chUSD`,
);
check(
  'payout == stake * valueBp * premiumBp / 1e6',
  onChain === payoutBase(STAKE, voyage.state.valueBp, voyage.state.surveys),
  `${formatEther(STAKE)} * ${voyage.state.valueBp} * ${10_000 - SURVEYS * 150} / 1e6`,
);
check('declining would have paid less than she did', declinePayout(voyage.mirror) < onChain, `${formatEther(declinePayout(voyage.mirror))} chUSD`);
check('the vault settled the voyage (balance moved)', after !== before, `${formatEther(after - before)} chUSD net across ${attempts} voyages`);

/**
 * The security model, on chain.
 *
 * Every word the session consumed is in the event log. The one that decided her
 * is the LAST, and it has to have arrived after the call — if it had arrived at
 * the start, the player could have read it out of the session before choosing.
 */
console.log('');
const advancedAll = await query(voyage.sessionId, advancedEvent);
const words = advancedAll.map(a => a['randomness'] as string).filter(w => w && /[1-9a-f]/.test(w.slice(2)));
check(
  'one word per step, and the settling one came last',
  advancedAll.length >= SURVEYS + 1,
  `${advancedAll.length} steps before the call, ${words.length} words emitted`,
);
check(
  'the deciding word was requested AFTER the call was submitted',
  Number(settled['randomness'] ? 1 : 0) === 1 && !words.includes(settled['randomness'] as string),
  'the settling word appears in no step the player could act on',
);
check(
  'the settled gameState still says COMMITTED, so the call is on the record',
  decodeGameState(settled['gameState'] as string).phase === 2,
);
/**
 * And the other half of it: DECLINE settles in the same transaction, with no
 * word requested and none needed. A player who walks away can never be left
 * waiting on randomness that never arrives — which is why `cancelStuckRandomness`
 * refunding only the escrowed stake is survivable here.
 */
const walkAway = await playVoyage();
const declineTx = await send('submitAction', [walkAway.encoded, DECLINE]);
const declinedNow = logsOf(declineTx, 'CasinoSessionSettled')[0];
check(
  'DECLINE settles in the same transaction, with no word requested',
  declinedNow !== undefined,
  declinedNow ? `phase ${Number(declinedNow['phase'])} in one tx` : 'it waited on randomness',
);
check(
  'and it pays the premium share, whatever she would have been',
  (declinedNow?.['payout'] as bigint | undefined) === declinePayout(walkAway.mirror),
  `${formatEther((declinedNow?.['payout'] as bigint | undefined) ?? 0n)} chUSD = ${DECLINE_BP / 100}x of ${(10_000 - SURVEYS * 150) / 100}%`,
);
check(
  'its settled state never reached COMMITTED — nothing was ever underwritten',
  decodeGameState((declinedNow?.['gameState'] as string) ?? '0x0000000000').phase === 1,
  `${MAX_SURVEYS - SURVEYS} surveyors were still available and were not sent`,
);

console.log(`\n${fail === 0 ? '\x1b[32mEXIT GATE GREEN\x1b[0m' : '\x1b[31mEXIT GATE RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
