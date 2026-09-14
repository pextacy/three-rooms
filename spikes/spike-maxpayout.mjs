// SPIKE C1 (end to end) — plan.md R6 / claude.md I5.
// Settles a REAL 25x win through LocalCasinoHost's payout cap. If the reserve
// and the payout disagree by one base unit, _finalizeSession reverts with
// LocalCasinoHost__InvalidPayout and this script goes red.
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const SDK = new URL('../sdk/casino-sdk/', import.meta.url);
const deployed = JSON.parse(readFileSync(new URL('simulator/local-node/deployed.json', SDK), 'utf8'));
const chain = { id: deployed.chainId, name: 'local', nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 }, rpcUrls: { default: { http: [deployed.rpcUrl] } } };
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const pub = createPublicClient({ chain, transport: http(deployed.rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(deployed.rpcUrl) });
const game = deployed.games.find(g => g.name === 'CandleSpikeMaxGame');
if (!game) throw new Error('CandleSpikeMaxGame not deployed');

const hostAbi = [
  { type: 'function', name: 'openSession', stateMutability: 'nonpayable', inputs: [{ name: 'game', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'sessionId', type: 'uint256' }, { name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'submitAction', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }, { name: 'actionData', type: 'bytes' }], outputs: [{ name: 'requestId', type: 'bytes32' }] },
  { type: 'event', name: 'CasinoSessionAdvanced', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'step', type: 'uint32', indexed: true }, { name: 'requestId', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' }, { name: 'session', type: 'bytes' }] },
  { type: 'event', name: 'CasinoSessionSettled', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'game', type: 'address', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'phase', type: 'uint8' }, { name: 'payout', type: 'uint256' }, { name: 'randomness', type: 'bytes32' }, { name: 'gameState', type: 'bytes' }] },
];
const tokenAbi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const logsOf = (r, n) => r.logs.map(l => { try { return decodeEventLog({ abi: hostAbi, data: l.data, topics: l.topics }); } catch { return null; } }).filter(e => e && e.eventName === n).map(e => e.args);
const send = async (fn, args) => pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.host, abi: hostAbi, functionName: fn, args, chain, account }) });

let PASS = 0, FAIL = 0;
const check = (l, ok, d = '') => { console.log(`   ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${l}${d ? ` — ${d}` : ''}`); ok ? PASS++ : FAIL++; };

const WAGER = parseEther('100');
console.log('\n\x1b[1m[C1] end-to-end 25x settlement through the facet payout cap\x1b[0m');
console.log(`game CandleSpikeMaxGame ${game.address} · stake ${formatEther(WAGER)} chUSD\n`);

const before = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, WAGER * 10n], chain, account }) });

const open = await send('openSession', [game.address, deployed.vault, WAGER, '0x']);
const sessionId = logsOf(open, 'CasinoSessionAdvanced')[0].sessionId;

// wait for the inch-1 lot
let enc = null;
for (let i = 0; i < 120 && !enc; i++) {
  const block = await pub.getBlockNumber();
  const adv = await pub.getLogs({ address: deployed.host, event: hostAbi.find(e => e.name === 'CasinoSessionAdvanced'), args: { sessionId }, fromBlock: 0n, toBlock: block });
  const last = adv[adv.length - 1];
  if (last && Number(last.args.step) > 1) enc = last.args.session;
  else await new Promise(r => setTimeout(r, 250));
}
if (!enc) throw new Error('no inch-1 lot');
const faceBp = parseInt(enc.slice(-6, -2), 16);
check('inch 1 lot is the Sarah Christiana (2500 bp = 25.00x)', faceBp === 2500, `faceBp ${faceBp}`);

// CLAIM at inch 1 -> the maximum payout this game can produce
const claim = await send('submitAction', [enc, '0x00']);
const settled = logsOf(claim, 'CasinoSessionSettled')[0];
const after = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });

check('the settlement did NOT revert against the cap', settled !== undefined, 'no LocalCasinoHost__InvalidPayout');
check('phase == SETTLED', Number(settled.phase) === 3);
check('payout == exactly 25x the stake', settled.payout === WAGER * 25n, `${formatEther(settled.payout)} chUSD`);
check('player balance moved by +24x (payout minus the staked 1x)', after - before === WAGER * 24n, `${formatEther(after - before)} chUSD net`);

console.log(`\n\x1b[1m${FAIL === 0 ? '\x1b[32mALL GREEN' : '\x1b[31mRED'}\x1b[0m  ${PASS} passed, ${FAIL} failed\n`);
process.exit(FAIL === 0 ? 0 : 1);
