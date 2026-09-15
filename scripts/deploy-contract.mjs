/**
 * `npm run deploy:contract` — deploys one of this repo's game contracts to a
 * real chain.
 *
 * The jam's final deliverable is "your audited game contract (deployed address on
 * the target chain)". The chain, the key and the gas are the entrant's, so this
 * takes them as inputs and does everything else — including reading the deployed
 * contract back and checking it answers the way the local one does.
 *
 *   RPC_URL=https://…  DEPLOYER_KEY=0x…  npm run deploy:contract
 *
 * It refuses to run against a chain it has not been told about, so a stray
 * default cannot put money on the wrong network.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, http } from 'viem';

const ROOT = new URL('..', import.meta.url).pathname;
const rpc = process.env['RPC_URL'];
const key = process.env['DEPLOYER_KEY'];

const B = s => `\x1b[1m${s}\x1b[0m`;
const D = s => `\x1b[2m${s}\x1b[0m`;

/**
 * All three entries deploy the same way, and each is read back against the
 * numbers its own DP produced. The expectations are computed here from the
 * generated Solidity rather than typed, so a retuned manifest cannot leave a
 * stale assertion behind.
 *
 * `maxPayoutBp` is the cap in basis points of the wager, not a whole multiple:
 * THE BROKERS tops out at 4.9905x, because Vanderdek's 5.00x still has his
 * 0.95% fee taken out of it.
 */
const GAMES = {
  candle: {
    title: 'CANDLE',
    source: 'contracts/Candle.sol:CandleGame',
    artifact: 'contracts/out/Candle.sol/CandleGame.json',
    generated: 'contracts/generated/Paytable.sol',
    maxPayoutBp: 250_000n,
    // P(the Sarah Christiana) = 20/10000.
    probabilityWad: 2_000_000_000_000_000n,
    rtp: { num: 7_577_820_426_157n, den: 7_812_500_000_000n, label: '96.9961%' },
    note: 'CANDLE is not heavy-tailed',
  },
  survey: {
    title: 'THE SURVEY',
    source: 'contracts/Survey.sol:SurveyGame',
    artifact: 'contracts/out/Survey.sol/SurveyGame.json',
    generated: 'contracts/generated/Manifest.sol',
    maxPayoutBp: 200_000n,
    // P(Indigo) x P(sound at the prior) = 0.02 x 0.4.
    probabilityWad: 8_000_000_000_000_000n,
    rtp: null, // read out of the generated library below
    note: 'THE SURVEY is not heavy-tailed either',
  },
  brokers: {
    title: 'THE BROKERS',
    source: 'contracts/Brokers.sol:BrokersGame',
    artifact: 'contracts/out/Brokers.sol/BrokersGame.json',
    generated: 'contracts/generated/Market.sol',
    maxPayoutBp: null, // read out of the generated library below
    // P(Vanderdek names 5.00x) = 25/10000. The only way past 2.30x.
    probabilityWad: 2_500_000_000_000_000n,
    rtp: null, // read out of the generated library below
    note: 'THE BROKERS is not heavy-tailed either',
  },
};

const which = (process.argv[2] ?? process.env['GAME'] ?? 'candle').toLowerCase();
const game = GAMES[which];

if (!game) {
  console.error(`\nUnknown game "${which}". One of: ${Object.keys(GAMES).join(', ')}\n`);
  console.error(D('  npm run deploy:contract -- brokers\n'));
  process.exit(1);
}

// The later entries' declared RTP and payout cap are generated, so they are read
// rather than restated. A regenerated manifest moves them here automatically.
if (!game.rtp || !game.maxPayoutBp) {
  const generated = readFileSync(join(ROOT, game.generated), 'utf8');
  const read = name => new RegExp(`${name} = ([0-9_]+)`).exec(generated)?.[1]?.replace(/_/g, '');
  if (!game.rtp) {
    const num = read('RTP_NUM');
    const den = read('RTP_DEN');
    const percent = /Declared RTP under optimal play: ([0-9.]+%)/.exec(generated)?.[1];
    if (!num || !den) {
      console.error(`\n${game.generated} carries no RTP constants — run \`npm run gen:${which}\`.\n`);
      process.exit(1);
    }
    game.rtp = { num: BigInt(num), den: BigInt(den), label: percent ?? `${num}/${den}` };
  }
  if (!game.maxPayoutBp) {
    const bp = read('MAX_PAYOUT_BP');
    if (!bp) {
      console.error(`\n${game.generated} carries no MAX_PAYOUT_BP — run \`npm run gen:${which}\`.\n`);
      process.exit(1);
    }
    // The library states it in price basis points of the stake (/10,000), which
    // is exactly the scale this cap is in.
    game.maxPayoutBp = BigInt(bp);
  }
}

/** The cap, and a label for it: "25x" reads better than "250000bp". */
const capPayout = w => (w * game.maxPayoutBp) / 10_000n;
const capLabel = `${(Number(game.maxPayoutBp) / 10_000).toString()}x`;

if (!rpc || !key) {
  console.error(`\n${B(`${game.title} — deploy the contract`)}\n`);
  console.error('Both of these are required, and neither has a default:\n');
  console.error('  RPC_URL       the target chain');
  console.error('  DEPLOYER_KEY  a funded key on it\n');
  console.error(D(`  RPC_URL=https://… DEPLOYER_KEY=0x… npm run deploy:contract -- ${which}\n`));
  console.error('There is no default chain on purpose: a wrong one costs real money.\n');
  process.exit(1);
}

console.log(`\n${B(`${game.title} — deploy the contract`)}`);
console.log(D(`  ${rpc}\n`));

// Build first, with the same settings the simulator uses.
console.log(B('1. build'));
execFileSync('forge', ['build'], { cwd: ROOT, stdio: 'inherit' });

const artifact = JSON.parse(readFileSync(join(ROOT, game.artifact), 'utf8'));
const size = (artifact.deployedBytecode?.object?.length ?? 2) / 2 - 1;
console.log(D(`  deployed bytecode ${size.toLocaleString('en-US')} bytes (EIP-170 limit is 24,576)`));
if (size > 24_576) {
  console.error('\n\x1b[31mOver the contract size limit.\x1b[0m\n');
  process.exit(1);
}

console.log(`\n${B('2. deploy')}`);
const out = execFileSync(
  'forge',
  ['create', game.source, '--rpc-url', rpc, '--private-key', key, '--broadcast'],
  { cwd: ROOT, encoding: 'utf8' },
);
console.log(out.trim());

const address = /Deployed to:\s*(0x[0-9a-fA-F]{40})/.exec(out)?.[1];
if (!address) {
  console.error('\n\x1b[31mThe deploy produced no address.\x1b[0m\n');
  process.exit(1);
}

// Read it back. A contract that deployed but answers differently is worse than
// one that failed to deploy, because nothing tells you.
//
// viem rather than `cast`: it is already a dependency here, and some nodes
// reject the JSON `cast call` sends for an eth_call.
console.log(`\n${B('3. read it back')}`);
const client = createPublicClient({ transport: http(rpc) });
const wager = 10n ** 18n;

const [maxEscrow, maxReserved] = await client.readContract({
  address,
  abi: [
    {
      type: 'function',
      name: 'quoteCaps',
      stateMutability: 'view',
      inputs: [{ type: 'uint256' }, { type: 'bytes' }],
      outputs: [{ type: 'uint256' }, { type: 'uint256' }],
    },
  ],
  functionName: 'quoteCaps',
  args: [wager, '0x'],
});

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

check('maxEscrowStake is the wager', maxEscrow === wager);
check(
  'maxReservedProfit is the whole win above the stake',
  maxReserved === capPayout(wager) - wager,
  `no slack on the ${capLabel} cap`,
);
check('the facet cap equals the maximum payout', maxEscrow + maxReserved === capPayout(wager));

const [maxPayout, probabilityWad, expectedPayout, subVariance] = await client.readContract({
  address,
  abi: [
    {
      type: 'function',
      name: 'quoteRiskParams',
      stateMutability: 'view',
      inputs: [{ type: 'uint256' }, { type: 'bytes' }],
      outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    },
  ],
  functionName: 'quoteRiskParams',
  args: [wager, '0x'],
});

check(
  `maxPayout is ${capLabel} and agrees with quoteCaps`,
  maxPayout === capPayout(wager) && maxPayout === maxEscrow + maxReserved,
);
check(
  'probabilityWad is the top tier only',
  probabilityWad === game.probabilityWad,
  `${(Number(game.probabilityWad) / 1e16).toFixed(2)}%`,
);
check(
  'expectedPayout is the declared RTP',
  expectedPayout === (wager * game.rtp.num) / game.rtp.den,
  game.rtp.label,
);
check(`subJackpotVarianceScaled is 0 — ${game.note}`, subVariance === 0n);

console.log(`\n${failed === 0 ? '\x1b[32mDEPLOYED\x1b[0m' : '\x1b[31mDEPLOYED BUT WRONG\x1b[0m'}  ${B(address)}\n`);
const rest = Object.keys(GAMES).filter(name => name !== which);
console.log(D(`Deploy the others with \`npm run deploy:contract -- ${rest.join('\` and \`npm run deploy:contract -- ')}\`.`));
console.log(D('Give this address to the Chain.wtf team with the live URL; they wire the'));
console.log(D('whitelist, the indexer and the catalog entry.\n'));
process.exit(failed === 0 ? 0 : 1);
