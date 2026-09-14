/**
 * The gates (claude.md §4, docs.md §7). A red gate is a failure.
 * Do not "fix" a gate by loosening it.
 *
 *   node scripts/gates.mjs                       # build-output gates + header config
 *   node scripts/gates.mjs --headers-only        # just the header/widget gates
 *   node scripts/gates.mjs --origin https://…    # re-read a LIVE origin (phase 5)
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');

const args = process.argv.slice(2);
const headersOnly = args.includes('--headers-only');
const origin = args.includes('--origin') ? args[args.indexOf('--origin') + 1] : null;

const BUNDLE_BUDGET_BYTES = 150 * 1024; // prd.md §7
const IMAGE_BUDGET_BYTES = 8 * 1024; // I12
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.webm']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);
const WIDGET_TAG = 'jam.chain.wtf/widget.js';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  ok ? pass++ : fail++;
};

const walk = async dir => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
};

// ---------------------------------------------------------------- header config
console.log('\n\x1b[1mheaders — vercel.json\x1b[0m');
const vercelRaw = await readFile(join(ROOT, 'vercel.json'), 'utf8');
const vercel = JSON.parse(vercelRaw);
const allHeaders = (vercel.headers ?? []).flatMap(r => r.headers ?? []);
const csp = allHeaders.find(h => h.key.toLowerCase() === 'content-security-policy');

check('Content-Security-Policy is set', Boolean(csp), csp?.value);
check('CSP is exactly "frame-ancestors *"', csp?.value.trim() === 'frame-ancestors *', 'I8');
check(
  'no X-Frame-Options anywhere in vercel.json',
  !/x-frame-options/i.test(vercelRaw),
  'a stray SAMEORIGIN silently costs the gallery preview',
);

// A framework preset or a stray file can reintroduce it; grep the whole repo.
const repoFiles = (await walk(ROOT)).filter(
  f => !f.includes('/node_modules/') && !f.includes('/dist/') && !f.includes('/.git/') && !f.includes('/sdk/'),
);
const xfoOffenders = [];
for (const f of repoFiles) {
  if (!['.json', '.ts', '.tsx', '.js', '.mjs', '.html', '.toml', '.yml', '.yaml'].includes(extname(f))) continue;
  const text = await readFile(f, 'utf8').catch(() => '');
  // gates.mjs names the header in order to forbid it; skip itself.
  if (f.endsWith('scripts/gates.mjs')) continue;
  if (/x-frame-options/i.test(text)) xfoOffenders.push(f.replace(ROOT, ''));
}
check('no X-Frame-Options anywhere in the repo', xfoOffenders.length === 0, xfoOffenders.join(', '));

// ---------------------------------------------------------------- widget tag
console.log('\n\x1b[1mjam widget — raw HTML\x1b[0m');
const srcHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const countIn = text => (text.match(new RegExp(WIDGET_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
check('index.html contains the widget tag exactly once', countIn(srcHtml) === 1, `${countIn(srcHtml)} occurrence(s)`);
check(
  'the widget tag is a real <script src>, not injected by JS',
  /<script[^>]+src=["']https:\/\/jam\.chain\.wtf\/widget\.js["']/.test(srcHtml),
  'the gallery reads the served document',
);

if (existsSync(join(DIST, 'index.html'))) {
  const builtHtml = await readFile(join(DIST, 'index.html'), 'utf8');
  check('dist/index.html contains the widget tag exactly once', countIn(builtHtml) === 1, `${countIn(builtHtml)} occurrence(s)`);
} else if (!headersOnly) {
  check('dist/index.html exists (run `npm run build`)', false);
}

// ---------------------------------------------------------------- manifest
console.log('\n\x1b[1mmanifest\x1b[0m');
const manifestPath = join(ROOT, 'public', 'game.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
check('game.manifest.json parses', true);
check('schemaVersion/apiVersion are 1', manifest.schemaVersion === 1 && manifest.apiVersion === 1);
check('gameId is set and matches the contract name', manifest.gameId === 'CandleGame', manifest.gameId);
check('defaultLocale exists in locales', Boolean(manifest.locales?.[manifest.defaultLocale]?.name));
check('capabilities.openSession is true', manifest.capabilities?.openSession === true);
check(
  'capabilities.submitAction is true (CANDLE is multi-action)',
  manifest.capabilities?.submitAction === true,
  'BURN is an on-chain player action',
);

// ---------------------------------------------------------------- build output
if (!headersOnly) {
  console.log('\n\x1b[1mbundle\x1b[0m');
  if (!existsSync(DIST)) {
    check('dist/ exists', false, 'run `npm run build` first');
  } else {
    const files = await walk(DIST);
    let gz = 0;
    for (const f of files) {
      if (['.js', '.css', '.html'].includes(extname(f))) gz += gzipSync(await readFile(f)).length;
    }
    check(
      `bundle < ${BUNDLE_BUDGET_BYTES / 1024} KB gzipped`,
      gz < BUNDLE_BUDGET_BYTES,
      `${(gz / 1024).toFixed(1)} KB gzipped`,
    );

    const audio = files.filter(f => AUDIO_EXT.has(extname(f)));
    check('zero audio files (everything synthesised)', audio.length === 0, audio.join(', '));

    const big = [];
    for (const f of files.filter(f => IMAGE_EXT.has(extname(f)))) {
      const s = await stat(f);
      if (s.size > IMAGE_BUDGET_BYTES) big.push(`${f.replace(DIST, '')} ${(s.size / 1024).toFixed(1)} KB`);
    }
    check(`no image over ${IMAGE_BUDGET_BYTES / 1024} KB`, big.length === 0, big.join(', '));

    check('dist/game.manifest.json is served at the origin', existsSync(join(DIST, 'game.manifest.json')));
  }
}

// ---------------------------------------------------------------- live origin
if (origin) {
  console.log(`\n\x1b[1mlive origin — ${origin}\x1b[0m`);
  const res = await fetch(origin, { redirect: 'follow' });
  const html = await res.text();
  const hdr = n => res.headers.get(n);
  check('origin responds 200', res.status === 200, String(res.status));
  check('CSP frame-ancestors * is served', (hdr('content-security-policy') ?? '').includes('frame-ancestors *'), hdr('content-security-policy') ?? 'missing');
  check('NO X-Frame-Options is served', hdr('x-frame-options') === null, hdr('x-frame-options') ?? 'absent');
  check('served HTML contains the widget tag exactly once', countIn(html) === 1, `${countIn(html)} occurrence(s)`);
  const mres = await fetch(new URL('/game.manifest.json', origin));
  check('game.manifest.json is live and parses', mres.ok && Boolean(await mres.json().catch(() => null)), String(mres.status));
}

console.log(`\n${fail === 0 ? '\x1b[32mGATES GREEN\x1b[0m' : '\x1b[31mGATES RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
