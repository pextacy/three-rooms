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

/**
 * The ENTRIES are the game pages, not the lobby. `/` lists the games and is not
 * submitted, carries no jam widget and reports no engagement; each game lives in
 * its own directory with its own manifest beside it, which is how the host
 * resolves one (`new URL('game.manifest.json', gameUrl)`).
 */
const GAMES = ['candle'];
const srcHtml = await readFile(join(ROOT, 'candle', 'index.html'), 'utf8');
const lobbyHtml = await readFile(join(ROOT, 'index.html'), 'utf8');

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
//
// The pattern matches the header being SET, not merely named. An earlier version
// flagged any occurrence, which meant the rule could not be written down: it
// failed on gates.mjs for forbidding it, and then on the README generator for
// documenting it. A rule has to be documentable in the files it governs.
const SETS_XFO = [
  /["']x-frame-options["']\s*[:,]/i, // a header key in JSON or an object literal
  /setHeader\s*\(\s*["']x-frame-options/i, // an explicit setHeader call
  /^\s*x-frame-options\s*:/im, // a _headers / .htaccess style line
  /http-equiv=["']x-frame-options["']/i, // a <meta> tag
];
// Backticks are markdown, not header syntax: `X-Frame-Options` in prose is a
// mention, and comments are stripped before matching for the same reason.
const repoFiles = (await walk(ROOT)).filter(
  f => !f.includes('/node_modules/') && !f.includes('/dist/') && !f.includes('/.git/') && !f.includes('/sdk/'),
);
const xfoOffenders = [];
for (const f of repoFiles) {
  if (!['.json', '.ts', '.tsx', '.js', '.mjs', '.html', '.toml', '.yml', '.yaml'].includes(extname(f))) continue;
  const text = await readFile(f, 'utf8').catch(() => '');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (SETS_XFO.some(pattern => pattern.test(code))) xfoOffenders.push(f.replace(ROOT, ''));
}
check('nothing in the repo SETS X-Frame-Options', xfoOffenders.length === 0, xfoOffenders.join(', '));

// ---------------------------------------------------------------- widget tag
console.log('\n\x1b[1mjam widget — raw HTML\x1b[0m');
const countIn = text => (text.match(new RegExp(WIDGET_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
for (const game of GAMES) {
  const html = await readFile(join(ROOT, game, 'index.html'), 'utf8');
  check(`${game}/index.html contains the widget tag exactly once`, countIn(html) === 1, `${countIn(html)} occurrence(s)`);
}
check(
  'the lobby carries NO widget — it is a door, not an entry',
  countIn(lobbyHtml) === 0,
  'a widget there would report engagement for something never submitted',
);
check(
  'the widget tag is a real <script src>, not injected by JS',
  /<script[^>]+src=["']https:\/\/jam\.chain\.wtf\/widget\.js["']/.test(srcHtml),
  'the gallery reads the served document',
);

for (const game of GAMES) {
  const built = join(DIST, game, 'index.html');
  if (existsSync(built)) {
    const html = await readFile(built, 'utf8');
    check(`dist/${game}/index.html contains the widget tag exactly once`, countIn(html) === 1, `${countIn(html)} occurrence(s)`);
  } else if (!headersOnly) {
    check(`dist/${game}/index.html exists (run \`npm run build\`)`, false);
  }
}

// ---------------------------------------------------------------- the document
console.log('\n\x1b[1mdocument head\x1b[0m');
{
  const built = join(DIST, 'candle', 'index.html');
  const head = existsSync(built) ? await readFile(built, 'utf8') : srcHtml;
  const favicon = /rel="icon"\s+href="(data:image\/svg\+xml,[^"]+)"/.exec(head);
  check(
    'a favicon is inlined, so nothing 404s in a console a judge has open',
    favicon !== null,
    favicon ? `${Buffer.byteLength(favicon[1] ?? '')} bytes, no extra request` : '',
  );
  check('it is well under the 8 KB image budget', Buffer.byteLength(favicon?.[1] ?? '') < 8 * 1024);
  check('the page says what it is when its URL is pasted somewhere', /og:title/.test(head) && /og:description/.test(head));
  check('a theme colour is set, so browser chrome matches the room', /name="theme-color"/.test(head));
  check('the document declares a language', /<html[^>]+lang="/.test(head));
}

// ---------------------------------------------------------------- no storage
console.log('\n\x1b[1mbrowser storage\x1b[0m');
{
  // claude.md §7: a purse that looks like it survives a reload and does not is
  // worse than one that obviously resets. Grepped rather than tested, because a
  // test environment without storage passes a storage test for the wrong reason.
  const offenders = [];
  for (const f of repoFiles) {
    if (!['.ts', '.tsx'].includes(extname(f))) continue;
    if (!f.includes('/src/')) continue;
    const text = await readFile(f, 'utf8').catch(() => '');
    // Strip comments first — the rule has to be documentable in the very files
    // it governs, and a doc comment saying "localStorage is forbidden" is not a
    // use of localStorage.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(code)) offenders.push(f.replace(ROOT, ''));
  }
  check('src/ uses no localStorage, sessionStorage or indexedDB', offenders.length === 0, offenders.join(', '));
}

// ---------------------------------------------------------------- manifest
console.log('\n\x1b[1mmanifest\x1b[0m');
const manifestPath = join(ROOT, 'public', 'candle', 'game.manifest.json');
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

// ---------------------------------------------------------------- the contract
console.log('\n\x1b[1mcontract\x1b[0m');
{
  const vendored = await readFile(join(ROOT, 'contracts', 'ICasinoGameV2.sol'), 'utf8').catch(() => null);
  check('the ICasinoGameV2 interface is vendored beside the game', vendored !== null, 'so a standard toolchain can compile it');

  // A vendored interface that drifts from the SDK's is a contract that compiles
  // and then fails against the real facet. Diff the DECLARATIONS, ignoring the
  // header note the copy carries.
  const upstreamPath = join(ROOT, 'sdk', 'casino-sdk', 'solidity', 'ICasinoGameV2.sol');
  if (vendored !== null && existsSync(upstreamPath)) {
    const upstream = await readFile(upstreamPath, 'utf8');
    const strip = text =>
      text
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .trim();
    check('and is byte-identical to the SDK once comments are stripped', strip(vendored) === strip(upstream));
  } else {
    console.log(`  \x1b[2m· SDK absent, skipping the drift check (npm run sdk:fetch)\x1b[0m`);
  }

  const candle = await readFile(join(ROOT, 'contracts', 'Candle.sol'), 'utf8').catch(() => '');
  check('Candle.sol imports the interface by a path that resolves anywhere', /from '\.\/ICasinoGameV2\.sol'/.test(candle));
  check('the generated paytable is never hand-edited', /GENERATED FILE — DO NOT EDIT/.test(await readFile(join(ROOT, 'contracts', 'generated', 'Paytable.sol'), 'utf8').catch(() => '')));
  check('the contract declares no constructor arguments', !/constructor\s*\([^)]+\)/.test(candle), 'the SDK deploys it without any');
  check('every hook is view, so the game holds no storage', (candle.match(/external\s+pure\s+returns/g) ?? []).length >= 5);
}

// ---------------------------------------------------------------- generated docs
console.log('\n\x1b[1mgenerated documents\x1b[0m');
{
  // README.md and DEMO.md are written from the DP and from captured runs. A
  // stale one is worse than none, because a reviewer who spots a mismatch
  // cannot tell whether the build is wrong or the document is (claude.md §8).
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8').catch(() => '');
  check('README.md exists and is marked generated', /GENERATED FILE — DO NOT EDIT/.test(readme));
  check(
    'README.md carries the declared RTP as an exact rational',
    readme.includes('7577820426157 / 7812500000000'),
    'the one number a judge will check',
  );
  check('README.md publishes the whole strategy band, not just the flattering end', readme.includes('93.577%'));

  const demoDoc = await readFile(join(ROOT, 'DEMO.md'), 'utf8').catch(() => '');
  check('DEMO.md exists and is marked generated', /GENERATED FILE — DO NOT EDIT/.test(demoDoc));
  // Deliberately NOT "does it contain GATES GREEN": DEMO.md captures this very
  // command, so that check could never pass on a first run and could never fail
  // afterwards. Look for captured output that does not depend on this gate.
  check(
    'DEMO.md pastes real expected output, not a description of it',
    demoDoc.includes('VERIFIED  declared RTP') && /\n\s+5\s+40%\s+1500K/.test(demoDoc),
    'the verify:rtp headline and a verify:light row, both as captured',
  );

  check('a licence is present, so the source can actually be shared', existsSync(join(ROOT, 'LICENSE')));
}

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

      for (const game of GAMES) {
      check(`dist/${game}/game.manifest.json sits beside its page`, existsSync(join(DIST, game, 'game.manifest.json')));
    }
    check('the lobby exists and is not itself an entry', existsSync(join(DIST, 'index.html')));
  }
}

// ---------------------------------------------------------------- live origin
if (origin) {
  console.log(`\n\x1b[1mlive origin — ${origin}\x1b[0m`);
  // The entry is the GAME page; the origin root is the lobby.
  const gameUrl = new URL('/candle/', origin).toString();
  const res = await fetch(gameUrl, { redirect: 'follow' });
  const html = await res.text();
  const hdr = n => res.headers.get(n);
  check('the game page responds 200', res.status === 200, gameUrl);
  check('CSP frame-ancestors * is served', (hdr('content-security-policy') ?? '').includes('frame-ancestors *'), hdr('content-security-policy') ?? 'missing');
  check('NO X-Frame-Options is served', hdr('x-frame-options') === null, hdr('x-frame-options') ?? 'absent');
  check('served HTML contains the widget tag exactly once', countIn(html) === 1, `${countIn(html)} occurrence(s)`);
  const mres = await fetch(new URL('/candle/game.manifest.json', origin));
  check('game.manifest.json is live and parses', mres.ok && Boolean(await mres.json().catch(() => null)), String(mres.status));
}

console.log(`\n${fail === 0 ? '\x1b[32mGATES GREEN\x1b[0m' : '\x1b[31mGATES RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
