/**
 * `npm run spike:multidraw` / `spike:maxpayout` / `spike:coinflip` — replays a
 * D0 spike against the live local stack.
 *
 * `docs.md` §7.3 cites these three by name, with their pass counts and the
 * block numbers they measured, as the evidence that per-inch randomness is
 * supported and that an abandoned session forfeits for 90%. It then told a
 * reader to run them with `npm run spike` — which runs a different program
 * (`scripts/spike-sdk.ts`, the SDK symbol sweep). A reviewer following the
 * document would get 28 passes from a script the paragraph above was not
 * talking about, and no way to reach the 22 it claims.
 *
 * The honesty rule in `claude.md` §8 is that a claim a reviewer cannot
 * reproduce in under a minute is either made reproducible or deleted. The
 * measurements are real — this makes reaching them one command.
 *
 * Two of the spikes need their own throwaway contracts on chain. The local node
 * watches `sdk/casino-sdk/simulator/contracts/` and redeploys anything dropped
 * there (docs.md §7.1), so they are copied in and waited for, exactly the way
 * `sync-simulator.mjs` does it for the real three.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sdk = resolve(root, 'sdk/casino-sdk');
const watched = resolve(sdk, 'simulator/contracts');
const deployedPath = resolve(sdk, 'simulator/local-node/deployed.json');

/** Which contracts each spike needs on chain before it can say anything. */
const SPIKES = {
  multidraw: { file: 'spike-multidraw.mjs', needs: ['CandleSpikeGame'], sol: ['CandleSpike.sol'] },
  maxpayout: { file: 'spike-maxpayout.mjs', needs: ['CandleSpikeMaxGame'], sol: ['CandleSpikeMax.sol'] },
  coinflip: { file: 'spike-coinflip.mjs', needs: ['CoinflipGame'], sol: [] },
};

const name = process.argv[2];
const spike = SPIKES[name];
if (!spike) {
  console.error(`\nusage: node scripts/run-spike.mjs <${Object.keys(SPIKES).join('|')}>\n`);
  process.exit(1);
}

if (!existsSync(watched)) {
  console.error('\nsdk/casino-sdk is not unpacked — run `npm run sdk:fetch && npm run sdk:install`\n');
  process.exit(1);
}
if (!existsSync(deployedPath)) {
  console.error('\nthe local stack is not up — run `npm run sdk:stack` in another terminal\n');
  process.exit(1);
}

const deployedNames = () => {
  try {
    return new Set(JSON.parse(readFileSync(deployedPath, 'utf8')).games.map(g => g.name));
  } catch {
    return new Set();
  }
};

for (const file of spike.sol) {
  copyFileSync(resolve(root, 'spikes', file), resolve(watched, file));
  console.log(`  dropped ${file} into the simulator`);
}

// The node recompiles and redeploys on its own clock, so wait for the NAME
// rather than for a fixed number of seconds.
const deadline = Date.now() + 90_000;
for (;;) {
  const have = deployedNames();
  const missing = spike.needs.filter(n => !have.has(n));
  if (missing.length === 0) break;
  if (Date.now() > deadline) {
    console.error(`\n${missing.join(', ')} never deployed — is \`npm run sdk:stack\` running?\n`);
    process.exit(1);
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)']);
}
if (spike.sol.length > 0) console.log('  deployed\n');

const result = spawnSync(process.execPath, [resolve(root, 'spikes', spike.file)], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
