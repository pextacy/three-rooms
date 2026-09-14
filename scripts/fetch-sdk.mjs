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

const tmp = await mkdtemp(join(tmpdir(), 'candle-sdk-'));
const zip = join(tmp, 'casino-sdk.zip');
console.log(`downloading ${URL_}`);
const res = await fetch(URL_);
if (!res.ok) throw new Error(`SDK download failed: ${res.status}`);
await writeFile(zip, Buffer.from(await res.arrayBuffer()));
await mkdir(DEST, { recursive: true });
execFileSync('unzip', ['-q', '-o', zip, '-d', DEST], { stdio: 'inherit' });
await rm(tmp, { recursive: true, force: true });
console.log('sdk/casino-sdk restored — run `npm --prefix sdk/casino-sdk install` next');
