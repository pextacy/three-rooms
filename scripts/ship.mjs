/**
 * `npm run ship` — build, deploy, then RE-READ THE LIVE ORIGIN.
 *
 * plan.md D5 is explicit about the order: deploy, then go back and read what the
 * origin actually serves. A framework preset can inject `X-Frame-Options` after
 * the fact, and the entry then still "works" at its own URL while the jam gallery
 * shows pitch text instead of the game. Nobody notices until judging.
 *
 * Needs a Vercel login (`npx vercel login`). Everything before the deploy runs
 * without one, so a failure there is a real failure and not a missing account.
 */
import { execFileSync, execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const B = s => `\x1b[1m${s}\x1b[0m`;
const D = s => `\x1b[2m${s}\x1b[0m`;

console.log(`\n${B('CANDLE — ship')}\n`);

// --- everything that must be true before anything goes live ---------------
console.log(B('1. gates, before the deploy'));
run('npm', ['run', 'typecheck']);
run('npm', ['test']);
run('npm', ['run', 'verify:rtp']);
run('npm', ['run', 'gen:constants']);
run('npm', ['run', 'gen:readme']);

// A stale generated file is a published number that no longer matches the code.
try {
  execSync('git diff --exit-code -- README.md contracts/generated/', { cwd: ROOT, stdio: 'pipe' });
} catch {
  console.error('\n\x1b[31mREADME.md or the generated constants are stale.\x1b[0m');
  console.error('Commit the regenerated files before shipping.\n');
  process.exit(1);
}

run('npm', ['run', 'build']);
run('npm', ['run', 'gates']);
run('npm', ['run', 'gates:iframe']);

// --- deploy ----------------------------------------------------------------
console.log(`\n${B('2. deploy')}`);
let url = process.env['PRODUCTION_ORIGIN'] ?? null;
if (url) {
  console.log(D(`  PRODUCTION_ORIGIN is set — skipping the deploy and verifying ${url}`));
} else {
  try {
    url = capture('npx', ['--yes', 'vercel', 'deploy', '--prod', '--yes']).split('\n').filter(Boolean).pop() ?? null;
  } catch (error) {
    console.error(`\n\x1b[31mThe deploy failed.\x1b[0m ${error instanceof Error ? error.message : ''}`);
    console.error('\nIf this is an auth problem, run `npx vercel login` and try again.');
    console.error('To verify an origin deployed some other way:');
    console.error('  PRODUCTION_ORIGIN=https://… npm run ship\n');
    process.exit(1);
  }
}

if (!url || !url.startsWith('http')) {
  console.error('\n\x1b[31mThe deploy produced no URL.\x1b[0m\n');
  process.exit(1);
}

// --- the part that actually matters ---------------------------------------
console.log(`\n${B('3. re-read the live origin')}`);
console.log(D(`  ${url}\n`));
run('node', ['scripts/gates.mjs', '--headers-only', '--origin', url]);
run('node', ['scripts/iframe-check.mjs', url]);

console.log(`\n${B('Live:')} ${url}`);
console.log(D('\nNow submit it at https://jam.chain.wtf — that step is a human one.\n'));
