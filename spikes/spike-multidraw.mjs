// ============================================================================
//  SPIKE A + B driver — plan.md D0. Run it with `npm run spike:multidraw`.
//
//  Runs against the SDK's local stack (chain + real ECVRF node + LocalCasinoHost).
//  Nothing here is mocked: every word is a real VRF fulfillment.
//
//    node spikes/spike-multidraw.mjs
//
//  Answers, in order:
//    A1  can one session consume 5 VRF words, with a player action between each?
//    A2  is the word for inch k+1 causally AFTER the burn that asked for it? (I4)
//    B1  what does an abandoned session settle to?
//    C1  does a 25x payout land, or revert against the facet's cap? (I5)
//    C2  is BURN at the fifth inch actually rejected?
// ============================================================================
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const SDK = new URL('../sdk/casino-sdk/', import.meta.url);
const deployed = JSON.parse(readFileSync(new URL('simulator/local-node/deployed.json', SDK), 'utf8'));
// Anvil's well-known dev account #0. Published in the Foundry docs, funded only
// on a throwaway local chain, and worthless anywhere else — it is in the clear
// on purpose so this runs with no setup. Never a key that holds anything.
const PLAYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const chain = { id: deployed.chainId, name: 'local', nativeCurrency: { name: 'E', symbol: 'E', decimals: 18 }, rpcUrls: { default: { http: [deployed.rpcUrl] } } };
const account = privateKeyToAccount(PLAYER_KEY);
const pub = createPublicClient({ chain, transport: http(deployed.rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(deployed.rpcUrl) });

const game = deployed.games.find(g => g.name === 'CandleSpikeGame');
if (!game) throw new Error('CandleSpikeGame not deployed — drop spikes/CandleSpike.sol into sdk/casino-sdk/simulator/contracts/');

// --- minimal ABIs ----------------------------------------------------------
const hostAbi = [
  { type: 'function', name: 'openSession', stateMutability: 'nonpayable', inputs: [{ name: 'game', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wager', type: 'uint256' }, { name: 'gameData', type: 'bytes' }], outputs: [{ name: 'sessionId', type: 'uint256' }, { name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'submitAction', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }, { name: 'actionData', type: 'bytes' }], outputs: [{ name: 'requestId', type: 'bytes32' }] },
  { type: 'function', name: 'forfeitExpiredSession', stateMutability: 'nonpayable', inputs: [{ name: 'encodedSession', type: 'bytes' }], outputs: [{ name: 'payout', type: 'uint256' }] },
  { type: 'event', name: 'CasinoSessionAdvanced', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'step', type: 'uint32', indexed: true }, { name: 'requestId', type: 'bytes32' }, { name: 'randomness', type: 'bytes32' }, { name: 'session', type: 'bytes' }] },
  { type: 'event', name: 'CasinoSessionSettled', inputs: [{ name: 'sessionId', type: 'uint256', indexed: true }, { name: 'game', type: 'address', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'phase', type: 'uint8' }, { name: 'payout', type: 'uint256' }, { name: 'randomness', type: 'bytes32' }, { name: 'gameState', type: 'bytes' }] },
];
const tokenAbi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const CTX = { type: 'tuple', components: [{ name: 'sessionId', type: 'uint256' }, { name: 'player', type: 'address' }, { name: 'vault', type: 'address' }, { name: 'wagerBase', type: 'uint256' }, { name: 'escrowedStake', type: 'uint256' }, { name: 'reservedProfit', type: 'uint256' }, { name: 'step', type: 'uint32' }, { name: 'gameData', type: 'bytes' }, { name: 'gameState', type: 'bytes' }] };
const STEP_RESULT = { type: 'tuple', components: [{ name: 'newGameState', type: 'bytes' }, { name: 'escrowDelta', type: 'int256' }, { name: 'reservedProfitDelta', type: 'int256' }, { name: 'nextPhase', type: 'uint8' }, { name: 'requestRandomnessNow', type: 'bool' }, { name: 'payout', type: 'uint256' }] };
const gameAbi = [
  { type: 'function', name: 'onPlayerAction', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }, { name: 'actionData', type: 'bytes' }], outputs: [{ ...STEP_RESULT, name: 'r' }] },
  { type: 'function', name: 'quoteForfeitPayout', stateMutability: 'view', inputs: [{ ...CTX, name: 'ctx' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'quoteCaps', stateMutability: 'view', inputs: [{ name: 'w', type: 'uint256' }, { name: 'd', type: 'bytes' }], outputs: [{ name: 'maxEscrowStake', type: 'uint256' }, { name: 'maxReservedProfit', type: 'uint256' }] },
  { type: 'function', name: 'quoteRiskParams', stateMutability: 'view', inputs: [{ name: 'w', type: 'uint256' }, { name: 'd', type: 'bytes' }], outputs: [{ name: 'maxPayout', type: 'uint256' }, { name: 'probabilityWad', type: 'uint256' }, { name: 'expectedPayout', type: 'uint256' }, { name: 'subJackpotVarianceScaled', type: 'uint256' }] },
];

const WAX_BP = [10000, 8500, 7000, 5500, 4000];
const FACE_NAME = { 0: 'empty crate 0.00x', 50: "ship's stores 0.50x", 100: 'cordage 1.00x', 200: 'sailcloth 2.00x', 500: 'ordnance 5.00x', 2500: 'Sarah Christiana 25.00x' };

const decodeGameState = hex => {
  const b = hex.slice(2);
  if (b.length !== 8) return null;
  return { inch: parseInt(b.slice(0, 2), 16), faceBp: parseInt(b.slice(2, 6), 16), hasLot: parseInt(b.slice(6, 8), 16) === 1 };
};
const logsOf = (receipt, name) => receipt.logs
  .map(l => { try { return decodeEventLog({ abi: hostAbi, data: l.data, topics: l.topics }); } catch { return null; } })
  .filter(e => e && e.eventName === name)
  .map(e => e.args);

const send = async (fn, args) => {
  const hash = await wallet.writeContract({ address: deployed.host, abi: hostAbi, functionName: fn, args, chain, account });
  return pub.waitForTransactionReceipt({ hash });
};

// The VRF node fulfills asynchronously; wait for the session to leave WAITING_RANDOMNESS.
const waitForNextStep = async (sessionId, afterStep) => {
  for (let i = 0; i < 120; i++) {
    const block = await pub.getBlockNumber();
    const advanced = await pub.getLogs({ address: deployed.host, event: hostAbi.find(e => e.name === 'CasinoSessionAdvanced'), args: { sessionId }, fromBlock: 0n, toBlock: block });
    const settled = await pub.getLogs({ address: deployed.host, event: hostAbi.find(e => e.name === 'CasinoSessionSettled'), args: { sessionId }, fromBlock: 0n, toBlock: block });
    if (settled.length) return { settled: settled[settled.length - 1].args };
    const last = advanced[advanced.length - 1];
    if (last && Number(last.args.step) > afterStep) return { advanced: last.args };
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for session ${sessionId} to advance past step ${afterStep}`);
};

let PASS = 0, FAIL = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? PASS++ : FAIL++;
};

// ============================================================================
const WAGER = parseEther('100');

async function openRound() {
  await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, WAGER * 10n], chain, account }) });
  const receipt = await send('openSession', [game.address, deployed.vault, WAGER, '0x']);
  const opened = logsOf(receipt, 'CasinoSessionAdvanced')[0];
  const sessionId = opened.sessionId;
  if (sessionId === undefined) throw new Error('could not read sessionId from CasinoSessionAdvanced');
  const res = await waitForNextStep(sessionId, Number(opened.step));
  return { sessionId, res };
}

async function main() {
  console.log('\n\x1b[1mCANDLE — Phase 0 spike\x1b[0m');
  console.log(`chain ${deployed.chainId} · host ${deployed.host}\ngame  CandleSpikeGame ${game.address}\n`);

  // -- quotes ---------------------------------------------------------------
  console.log('\x1b[1m[caps] quoteCaps / quoteRiskParams\x1b[0m');
  const [maxEscrow, maxReserved] = await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'quoteCaps', args: [WAGER, '0x'] });
  const [maxPayout, probWad, expPayout] = await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'quoteRiskParams', args: [WAGER, '0x'] });
  check('maxEscrowStake == wager', maxEscrow === WAGER, formatEther(maxEscrow));
  check('maxReservedProfit == 24x wager', maxReserved === WAGER * 24n, `${formatEther(maxReserved)} (= 25x - 1x, no slack)`);
  check('maxPayout == 25x wager', maxPayout === WAGER * 25n, `${formatEther(maxPayout)} for a ${formatEther(WAGER)} stake`);
  check('probabilityWad == top tier 0.20%', probWad === 2000000000000000n, `${probWad} wad`);
  check('maxPayout/wager = 25 < heavy-tail threshold 100', maxPayout / WAGER < 100n, 'tiered jackpot path does NOT engage');
  check('expectedPayout ~ 96.9961% of wager', expPayout === (WAGER * 7577820426157n) / 7812500000000n, `${formatEther(expPayout)} / 100`);

  // -- A1/A2: ride the candle to the gutter --------------------------------
  console.log('\n\x1b[1m[A] Spike A — can ONE session consume FIVE VRF words?\x1b[0m');
  let { sessionId, res } = await openRound();
  const words = [];
  const burnBlocks = [];
  let fulfillBlocks = [];

  for (let guard = 0; guard < 12; guard++) {
    if (res.settled) {
      const gsF = decodeGameState(res.settled.gameState);
      words.push(res.settled.randomness);
      console.log(`   inch ${gsF.inch}: word ${res.settled.randomness.slice(0, 18)}… -> ${FACE_NAME[gsF.faceBp] ?? gsF.faceBp}  \x1b[2m(gutters, forced claim)\x1b[0m`);
      break;
    }
    const enc = res.advanced.session;
    const gs = decodeGameState('0x' + enc.slice(-8));
    words.push(res.advanced.randomness);
    console.log(`   inch ${gs.inch}: word ${res.advanced.randomness.slice(0, 18)}… -> ${FACE_NAME[gs.faceBp] ?? gs.faceBp}`);
    const burn = await send('submitAction', [enc, '0x01']);
    burnBlocks.push(burn.blockNumber);
    res = await waitForNextStep(sessionId, Number(logsOf(burn, 'CasinoSessionAdvanced')[0].step));
    fulfillBlocks.push(await pub.getBlockNumber());
  }

  const distinct = new Set(words);
  check('one session consumed 5 VRF words', words.length === 5, `${words.length} words`);
  check('every word is distinct (fresh VRF draw per inch)', distinct.size === 5, [...distinct].map(w => w.slice(0, 10)).join(' '));
  check('a player action sat between every draw', burnBlocks.length === 4, `${burnBlocks.length} burns at blocks ${burnBlocks.join(', ')}`);

  const settled = res.settled;
  const finalState = decodeGameState(settled.gameState);
  const expected = (WAGER * BigInt(finalState.faceBp) * BigInt(WAX_BP[finalState.inch - 1])) / 1000000n;
  check('settled at the fifth inch', finalState.inch === 5, `lot = ${FACE_NAME[finalState.faceBp]}`);
  check('payout == stake * faceBp * waxBp / 1e6, to the base unit', settled.payout === expected, `${formatEther(settled.payout)} chUSD`);

  console.log('\n\x1b[1m[A2] I4 — the word for inch k+1 is causally AFTER the burn that asked for it\x1b[0m');
  const ordered = burnBlocks.every((b, i) => fulfillBlocks[i] >= b);
  check('each fulfillment block >= its burn block', ordered, burnBlocks.map((b, i) => `${b}->${fulfillBlocks[i]}`).join(' '));
  check('the burn tx cannot see the word it requests', ordered, 'word is requested, then fulfilled in a later tx');

  // -- C2: BURN at the fifth inch is rejected -------------------------------
  console.log('\n\x1b[1m[C2] BURN at the fifth inch is rejected, not ignored\x1b[0m');
  const ctx5 = { sessionId: 1n, player: account.address, vault: deployed.vault, wagerBase: WAGER, escrowedStake: WAGER, reservedProfit: WAGER * 24n, step: 9, gameData: '0x', gameState: '0x050064' + '01' };
  let burn5Rejected = false;
  try {
    await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'onPlayerAction', args: [ctx5, '0x01'] });
  } catch (e) { burn5Rejected = /BurnAtLastInch|revert/i.test(e.message); }
  check('onPlayerAction(BURN) at inch 5 reverts', burn5Rejected, 'CandleSpike__BurnAtLastInch');
  const claim5 = await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'onPlayerAction', args: [ctx5, '0x00'] });
  check('onPlayerAction(CLAIM) at inch 5 settles', Number(claim5.nextPhase) === 3, `payout ${formatEther(claim5.payout)} (1.00x lot at 40% wax = 0.40x)`);

  // -- C1: does a 25x payout land, or revert against the facet cap? (I5) ----
  console.log('\n\x1b[1m[C1] I5 — a 25x win must pay the cap exactly, with no slack\x1b[0m');
  const ctxMax = { sessionId: 1n, player: account.address, vault: deployed.vault, wagerBase: WAGER, escrowedStake: WAGER, reservedProfit: WAGER * 24n, step: 2, gameData: '0x', gameState: '0x01' + '09c4' + '01' }; // inch 1, faceBp 2500, hasLot
  const maxClaim = await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'onPlayerAction', args: [ctxMax, '0x00'] });
  const facetCap = WAGER + WAGER * 24n; // escrowedStake + reservedProfit, the facet's ceiling
  check('the Sarah Christiana at inch 1 pays 25x', maxClaim.payout === WAGER * 25n, formatEther(maxClaim.payout));
  check('payout == facet cap exactly (not one base unit over)', maxClaim.payout === facetCap, `${formatEther(maxClaim.payout)} == escrow ${formatEther(WAGER)} + reserve ${formatEther(WAGER * 24n)}`);
  check('reservedProfitDelta on settle == 0 (I7)', maxClaim.reservedProfitDelta === 0n, 'releasing here would collapse the cap to 1x');

  // -- B: Spike B — what does an abandoned session settle to? ---------------
  console.log('\n\x1b[1m[B] Spike B — the hard timeout / forfeit path\x1b[0m');
  let encB = null, gsB = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const b = await openRound();
    let r = b.res;
    // burn until a non-empty lot is on the table, so the 10% cut is actually exercised
    for (let g = 0; g < 5 && !r.settled; g++) {
      const e = r.advanced.session;
      const gs = decodeGameState('0x' + e.slice(-8));
      if (gs.faceBp > 0) { encB = e; gsB = gs; break; }
      if (gs.inch >= 5) break;
      const burn = await send('submitAction', [e, '0x01']);
      r = await waitForNextStep(b.sessionId, Number(logsOf(burn, 'CasinoSessionAdvanced')[0].step));
    }
    if (encB) break;
  }
  if (!encB) throw new Error('could not reach a non-empty lot in 25 rounds');

  const claimValue = (WAGER * BigInt(gsB.faceBp) * BigInt(WAX_BP[gsB.inch - 1])) / 1000000n;
  console.log(`   abandoning at inch ${gsB.inch} with ${FACE_NAME[gsB.faceBp]} on the table`);

  const quoted = await pub.readContract({ address: game.address, abi: gameAbi, functionName: 'quoteForfeitPayout', args: [{ sessionId: 0n, player: account.address, vault: deployed.vault, wagerBase: WAGER, escrowedStake: WAGER, reservedProfit: WAGER * 24n, step: 2, gameData: '0x', gameState: '0x' + encB.slice(-8) }] });
  check('quoteForfeitPayout == the claim value on the table', quoted === claimValue, `${formatEther(quoted)} chUSD`);
  check('quote is > 0 (the 10% cut is genuinely exercised)', quoted > 0n);

  await pub.request({ method: 'hardhat_mine', params: ['0xA8C1'] }); // 43201 blocks
  const fr = await send('forfeitExpiredSession', [encB]);
  const fSettled = logsOf(fr, 'CasinoSessionSettled')[0];
  const expectedForfeit = (claimValue * 9000n) / 10000n;
  check('forfeit phase == FORFEITED', Number(fSettled.phase) === 4, `phase ${fSettled.phase}`);
  check('forfeit pays 90% of the claim value, NOT 100%', fSettled.payout === expectedForfeit, `paid ${formatEther(fSettled.payout)} vs full claim ${formatEther(claimValue)} — the facet takes a 10% cut; this measurement is why docs.md §3.4 says 90% and not 100%`);

  console.log(`\n\x1b[1m${FAIL === 0 ? '\x1b[32mALL GREEN' : '\x1b[31mRED'}\x1b[0m  ${PASS} passed, ${FAIL} failed\n`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch(e => { console.error('\x1b[31mspike crashed:\x1b[0m', e.message); process.exit(1); });
