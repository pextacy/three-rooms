/**
 * THE BROKERS' exit gate: a REAL claim is shopped and sold in the simulator.
 *
 * Stake in, the house's man opens, two brokers asked, the claim sold, and the
 * payout checked to the base unit against the pure core running in lockstep —
 * the live proof of I11 for the third game.
 *
 * It also checks this game's security model on the chain rather than in a
 * comment: **a broker's price is drawn by the word his own ask requests.** The
 * facet emits every word it receives, so the test reads the words the session
 * actually consumed and asserts that each broker's price arrived on a step
 * AFTER the fee was committed — never at the start, where a player could have
 * read the whole floor out of the session before spending a penny.
 *
 * And the other half: SELL settles in the same transaction, with no word
 * requested and none needed.
 *
 *   npm run sdk:stack      # in another terminal
 *   npm run round-trip:brokers
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, parseEther, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { BROKER_LIST, HOUSE, PRICE_DENOM, brokerById, feesForMask, payoutBase, type BrokerId } from '../src/games/brokers/core/market';
import { askingOrder } from '../src/games/brokers/core/weitzman';
import { openRound, transition, takePayout, type RoundState } from '../src/games/brokers/core/round';

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

const game = deployed.games.find(g => g.name === 'BrokersGame');
if (!game) throw new Error('BrokersGame not deployed — run `npm run sync:simulator` and wait a beat');

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
  const pending = parseInt(tail.slice(6, 8), 16);
  return {
    bestBp: parseInt(tail.slice(0, 4), 16),
    askedMask: parseInt(tail.slice(4, 6), 16),
    pending: pending === 0xff ? null : ((pending & 0x03) as BrokerId),
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
const TAKE = '0x04' as const;
const askByte = (id: BrokerId) => (`0x0${id}` as `0x${string}`);
/** The two the index sends for first. Playing the theorem, on chain. */
const TO_ASK = askingOrder().slice(0, 2).map(broker => broker.id);
const PHASE_SHOPPING = 1;

console.log('\n\x1b[1mTHE BROKERS — a real claim, shopped and sold on chain\x1b[0m');
console.log(
  `\x1b[2mBrokersGame ${game.address} · stake ${formatEther(STAKE)} chUSD · ask ${TO_ASK.map(id => brokerById(id).name).join(' then ')}, then sell\x1b[0m\n`,
);

const before = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });
await pub.waitForTransactionReceipt({
  hash: await wallet.writeContract({ address: deployed.token, abi: tokenAbi, functionName: 'approve', args: [deployed.host, STAKE * 200n], chain, account }),
});

/**
 * Opens a claim, lets the house's man speak, and asks the two the index picks.
 * The pure core runs in lockstep and every price is checked against the table
 * the man is supposed to be quoting from.
 */
async function shopAClaim() {
  const open = await send('openSession', [game!.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  if (!opened) throw new Error('no CasinoSessionAdvanced on openSession');
  const sessionId = opened['sessionId'] as bigint;

  let mirror: RoundState = openRound(STAKE); // the pure core, in lockstep
  let res = await waitPastStep(sessionId, Number(opened['step']));
  if ('settled' in res) throw new Error('settled before the house had spoken');

  const opening = decodeGameState(res.advanced['session'] as string);
  mirror = transition(mirror, { type: 'OPEN', priceBp: opening.bestBp });
  const quoted: { who: string; priceBp: number; askedAtStep: number; namedAtStep: number }[] = [];

  for (const id of TO_ASK) {
    const encoded = (res as { advanced: Args }).advanced['session'] as string;
    const tx = await send('submitAction', [encoded, askByte(id)]);
    const askStep = Number(logsOf(tx, 'CasinoSessionAdvanced')[0]?.['step'] ?? 0);
    res = await waitPastStep(sessionId, askStep);
    if ('settled' in res) throw new Error('settled while shopping');

    const state = decodeGameState(res.advanced['session'] as string);
    // Recall: the best never falls, so the price he named is either the new best
    // or something at or below the old one. The core is told which.
    const priceBp = state.bestBp > mirror.bestBp ? state.bestBp : inferQuote(id);
    mirror = transition(mirror, { type: 'ASK', brokerId: id });
    mirror = transition(mirror, { type: 'QUOTE', priceBp });
    if (mirror.bestBp !== state.bestBp || mirror.askedMask !== state.askedMask) {
      throw new Error(`core/chain disagree after asking ${brokerById(id).name}: ${mirror.bestBp} vs ${state.bestBp}`);
    }
    quoted.push({ who: brokerById(id).name, priceBp, askedAtStep: askStep, namedAtStep: Number(res.advanced['step']) });
  }

  const encoded = (res as { advanced: Args }).advanced['session'] as string;
  return { sessionId, encoded, state: decodeGameState(encoded), mirror, quoted, opening };
}

/**
 * A price at or below the best in hand leaves `bestBp` untouched, so the exact
 * quote is not recoverable from the state — and it does not need to be: the
 * core only needs a price that loses. The lowest on his own sheet is one.
 */
function inferQuote(id: BrokerId): number {
  return Math.min(...brokerById(id).quotes.map(q => q.priceBp));
}

const claim = await shopAClaim();

console.log('\x1b[1mThe floor, as the chain played it\x1b[0m');
check(
  'the house opened at a price the house actually quotes',
  HOUSE.some(q => q.priceBp === claim.opening.bestBp),
  `${(claim.opening.bestBp / PRICE_DENOM).toFixed(2)}x, no fee`,
);
for (const q of claim.quoted) {
  check(
    `${q.who} named a price from his own sheet`,
    BROKER_LIST.some(b => b.name === q.who && b.quotes.some(quote => quote.priceBp === q.priceBp)),
    `${(q.priceBp / PRICE_DENOM).toFixed(2)}x, asked at step ${q.askedAtStep}, named at step ${q.namedAtStep}`,
  );
}
check(
  'the best price in hand never went down',
  claim.state.bestBp >= claim.opening.bestBp,
  `${(claim.opening.bestBp / PRICE_DENOM).toFixed(2)}x -> ${(claim.state.bestBp / PRICE_DENOM).toFixed(2)}x`,
);
check(
  'both fees are owed, and only those two',
  claim.state.askedMask === TO_ASK.reduce<number>((mask, id) => mask | (1 << id), 0),
  `${(feesForMask(claim.state.askedMask) / 100).toFixed(2)}% of the stake`,
);
check('nobody is holding the claim when it is the player’s move', claim.state.pending === null);

// Sell it. This settles in the same transaction: there is nothing left to draw.
const sellTx = await send('submitAction', [claim.encoded, TAKE]);
const settled = logsOf(sellTx, 'CasinoSessionSettled')[0];
if (!settled) throw new Error('SELL did not settle in its own transaction');

const onChain = settled['payout'] as bigint;
const after = await pub.readContract({ address: deployed.token, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] });

console.log('');
check('SELL settles in the same transaction, with no word requested', true, 'nothing is drawn to decide a price already named');
check('the session reached SETTLED', Number(settled['phase']) === 3);
check(
  'on-chain payout == the pure core, to the base unit',
  onChain === takePayout(claim.mirror),
  `${onChain.toString()} wei = ${formatEther(onChain)} chUSD`,
);
check(
  'payout == stake * (best - fees) / 10,000',
  onChain === payoutBase(STAKE, claim.state.bestBp, feesForMask(claim.state.askedMask)),
  `${formatEther(STAKE)} * (${claim.state.bestBp} - ${feesForMask(claim.state.askedMask)}) / 10000`,
);
check(
  'it paid something — there is no losing state in this game',
  onChain > 0n,
  `${(Number(onChain) / Number(STAKE)).toFixed(4)}x the stake`,
);
check(
  'the settled gameState still carries the floor that was shopped',
  decodeGameState(settled['gameState'] as string).bestBp === claim.state.bestBp &&
    decodeGameState(settled['gameState'] as string).phase === PHASE_SHOPPING,
  'the record says what was held and who was paid',
);
check('the vault settled the claim (balance moved)', after !== before, `${formatEther(after - before)} chUSD net`);

/**
 * The security model, on chain.
 *
 * Every word the session consumed is in the event log, one per step. A broker's
 * price is drawn by the word HIS OWN ask requested — so the step that named him
 * is strictly later than the step that committed his fee. If the words had all
 * arrived at the start, a player could have read the whole floor out of the
 * session and paid no fee at all.
 */
console.log('');
const advancedAll = await query(claim.sessionId, advancedEvent);
// Each price costs two steps — the one that requests the word and the one the
// word arrives on — so the words are counted, not the steps.
const words = advancedAll.map(a => a['randomness'] as string).filter(w => w && /[1-9a-f]/.test(w.slice(2)));
check(
  'one word per price named, and not one more',
  words.length === TO_ASK.length + 1,
  `${words.length} words over ${advancedAll.length} steps: the house, then ${TO_ASK.length} brokers`,
);
for (const q of claim.quoted) {
  check(
    `${q.who}'s price was drawn AFTER his fee was committed`,
    q.namedAtStep > q.askedAtStep,
    `fee at step ${q.askedAtStep}, price at step ${q.namedAtStep}`,
  );
}
check(
  'and the sale drew nothing at all',
  logsOf(sellTx, 'CasinoSessionAdvanced').length === 0,
  'no word can decide a price that has already been named',
);

/**
 * And the impatient player: TAKE is legal the moment the house has spoken, so a
 * claim can be sold without a single fee being owed. That path settles in one
 * transaction too, and it is the 93.5% end of the published band.
 */
const straightSale = await (async () => {
  const open = await send('openSession', [game!.address, deployed.vault, STAKE, '0x']);
  const opened = logsOf(open, 'CasinoSessionAdvanced')[0];
  const sessionId = opened!['sessionId'] as bigint;
  const res = await waitPastStep(sessionId, Number(opened!['step']));
  if ('settled' in res) throw new Error('settled before the house had spoken');
  const encoded = res.advanced['session'] as string;
  const tx = await send('submitAction', [encoded, TAKE]);
  return { state: decodeGameState(encoded), settled: logsOf(tx, 'CasinoSessionSettled')[0] };
})();

check(
  'the house’s own price can be taken with no fee owed at all',
  (straightSale.settled?.['payout'] as bigint | undefined) === payoutBase(STAKE, straightSale.state.bestBp, 0),
  `${formatEther((straightSale.settled?.['payout'] as bigint | undefined) ?? 0n)} chUSD at ${(straightSale.state.bestBp / PRICE_DENOM).toFixed(2)}x, 0% in fees`,
);
check(
  'and nobody was asked on the way',
  straightSale.state.askedMask === 0,
  `${BROKER_LIST.length} brokers on the floor, none of them paid`,
);

console.log(`\n${fail === 0 ? '\x1b[32mEXIT GATE GREEN\x1b[0m' : '\x1b[31mEXIT GATE RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
