/**
 * The SDK is downloaded, not vendored (it is ~1 MB and not ours to commit).
 * This restores it into sdk/ on a fresh clone or in CI.
 */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = 'https://sdk.chain.wtf/sdk/casino-sdk.zip';
const DEST = new URL('../sdk/', import.meta.url).pathname;

if (existsSync(join(DEST, 'casino-sdk', 'package.json')) && !process.argv.includes('--force')) {
  console.log('sdk/casino-sdk already present — pass --force to re-download');
  process.exit(0);
}

/**
 * Runs as `postinstall`, so it must never break `npm install`. A machine with no
 * network still gets a working checkout for everything that does not need the
 * SDK — the RTP verification, the tests of the pure core, the contract. The
 * build fails loudly and tells you what to run (see `scripts/require-sdk.mjs`).
 */
const soft = process.argv.includes('--soft');

try {
  const tmp = await mkdtemp(join(tmpdir(), 'candle-sdk-'));
  const zip = join(tmp, 'casino-sdk.zip');
  console.log(`downloading ${URL_}`);
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`SDK download failed: ${res.status}`);
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  await mkdir(DEST, { recursive: true });
  execFileSync('unzip', ['-q', '-o', zip, '-d', DEST], { stdio: 'inherit' });
  await rm(tmp, { recursive: true, force: true });
  console.log('sdk/casino-sdk restored');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!soft) throw error;
  console.warn(`\n  could not fetch the SDK: ${message}`);
  console.warn('  Everything that does not need it still works. To retry:  npm run sdk:fetch\n');
}
