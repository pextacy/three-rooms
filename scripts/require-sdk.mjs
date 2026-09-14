/**
 * Fails the build with a sentence instead of a rollup stack trace.
 *
 * The SDK is downloaded rather than vendored, so a fresh clone has no
 * `sdk/casino-sdk`. Without this, `npm run build` ends in an ENOENT inside
 * rollup's plugin driver, which tells you nothing about what to do.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const guest = fileURLToPath(new URL('../sdk/casino-sdk/src/guest.ts', import.meta.url));

if (!existsSync(guest)) {
  console.error('\n\x1b[31mThe Chain.wtf SDK is missing.\x1b[0m');
  console.error('\nThe build aliases its guest bridge rather than reimplementing it, so it is');
  console.error('a build input. It is downloaded, not vendored:\n');
  console.error('  npm run sdk:fetch\n');
  process.exit(1);
}
