/**
 * Copies `contracts/` into the SDK simulator's watched folder.
 *
 * The local node watches `sdk/casino-sdk/simulator/contracts/` and redeploys any
 * `.sol` it sees within a couple of seconds (docs.md §7.1). This keeps the
 * canonical sources in `contracts/` where they belong and mirrors them over,
 * rather than editing inside the downloaded SDK.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const target = resolve(root, 'sdk/casino-sdk/simulator/contracts');

if (!existsSync(target)) {
  console.error('sdk/casino-sdk is not unpacked — run `npm run sdk:fetch && npm run sdk:install`');
  process.exit(1);
}

const files = ['Candle.sol', 'ICasinoGameV2.sol', 'generated/Paytable.sol'];
for (const file of files) {
  const from = resolve(root, 'contracts', file);
  const to = resolve(target, file);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`  ${file}`);
}
console.log('synced — the local node redeploys within a couple of seconds');
