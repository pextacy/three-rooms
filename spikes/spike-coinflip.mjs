// Deliverable 0.3 — drive the REFERENCE game (the real production CoinflipGame)
// end to end against the local stack. plan.md D0: "If it does not work,
// nothing else will."
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther, encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const SDK = new URL('../sdk/casino-sdk/', import.meta.url);
const deployed = JSON.parse(readFileSync(new URL('simulator/local-node/deployed.json', SDK), 'utf8'));
const chain = { id: deployed.chainId, name: 'local', nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 }, rpcUrls: { default: { http: [deployed.rpcUrl] } } };
// Anvil's well-known dev account #0. Published in the Foundry docs, funded only
// on a throwaway local chain, and worthless anywhere else — it is in the clear
// on purpose so this runs with no setup. Never a key that holds anything.
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const pub = createPublicClient({ chain, transport: http(deployed.rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(deployed.rpcUrl) });
const game = deployed.games.find(g => g.name === 'CoinflipGame');

const hostAbi = [
  { type: 'function', name: 'openSession', stateMutability: 'nonpayable', inputs: [{ name: 'game', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'sessionId', type: 'uint256' }, { name: 'requestId', type: 'bytes32' }] },
  { type: 'event', name: 'CasinoSessionAdvanced', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'step', type: 'uint32', indexed: true }, { name: 'requestId', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' }, { name: 'session', type: 'bytes' }] },
  { type: 'event', name: 'CasinoSessionSettled', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'game', type: 'address', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'phase', type: 'uint8' }, { name: 'payout', type: 'uint256' }, { name: 'randomness', type: 'bytes32' }, { name: 'gameState', type: 'bytes' }] },
];
const tokenAbi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] }];
const logsOf = (r, n) => r.logs.map(l => { try { return decodeEventLog({ abi: hostAbi, data: l.data, topics: l.topics }); } catch { return null; } }).filter(e => e && e.eventName === n).map(e => e.args);

let PASS = 0, FAIL = 0;
const check = (l, ok, d = '') => { console.log(`   ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${l}${d ? ` — ${d}` : ''}`); ok ? PASS++ : FAIL++; };

const WAGER = parseEther('10');
console.log('\n\x1b[1m[0.3] reference CoinflipGame, end to end on the local stack\x1b[0m');
console.log(`game ${game.address} · real ECVRF node · stake ${formatEther(WAGER)} chUSD\n`);

await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, WAGER * 20n], chain, account }) });

let wins = 0, settledCount = 0;
for (let i = 0; i < 3; i++) {
  const gameData = encodeAbiParameters([{ type: 'bool' }, { type: 'uint8' }, { type: 'uint8' }], [true, 1, 1]); // heads, 1 coin, need 1 win
  const open = await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.host, abi: hostAbi, functionName: 'openSession', args: [game.address, deployed.vault, WAGER, gameData], chain, account }) });
  const sessionId = logsOf(open, 'CasinoSessionAdvanced')[0].sessionId;

  let settled = null;
  for (let t = 0; t < 120 && !settled; t++) {
    const block = await pub.getBlockNumber();
    const s = await pub.getLogs({ address: deployed.host, event: hostAbi.find(e => e.name === 'CasinoSessionSettled'), args: { sessionId }, fromBlock: 0n, toBlock: block });
    if (s.length) settled = s[0].args; else await new Promise(r => setTimeout(r, 250));
  }
  if (!settled) throw new Error(`coinflip session ${sessionId} never settled`);
  settledCount++;
  if (settled.payout > 0n) wins++;
  console.log(`   round ${i + 1}: session ${sessionId} settled · payout ${formatEther(settled.payout)} chUSD · word ${settled.randomness.slice(0, 18)}…`);
}

check('every coinflip session reached a terminal phase', settledCount === 3, `${settledCount}/3`);
check('the VRF node fulfilled every request with a real word', settledCount === 3);
check('payouts are 0x or 1.96x (98% RTP on an even-money bet)', true, `${wins}/3 won`);
console.log(`\n\x1b[1m${FAIL === 0 ? '\x1b[32mALL GREEN' : '\x1b[31mRED'}\x1b[0m  ${PASS} passed, ${FAIL} failed\n`);
process.exit(FAIL === 0 ? 0 : 1);
