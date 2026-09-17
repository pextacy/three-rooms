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

/**
 * `--origin` with nothing after it used to leave `origin` undefined, skip the
 * whole live-origin section and still print GATES GREEN — a gate that checks
 * nothing and says it passed, which is the one failure mode claude.md §4 names
 * by hand. It now falls back to the origin this package declares, and refuses
 * to run at all if that is missing too.
 */
let origin = null;
if (args.includes('--origin')) {
  origin = args[args.indexOf('--origin') + 1] ?? null;
  if (origin === null || origin.startsWith('--')) {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
    origin = typeof pkg.homepage === 'string' && pkg.homepage.length > 0 ? pkg.homepage : null;
  }
  if (origin === null) {
    console.error(
      '\n\x1b[31mGATES RED\x1b[0m  --origin needs a URL, and package.json declares no homepage to fall back on\n',
    );
    process.exit(1);
  }
}

const BUNDLE_BUDGET_BYTES = 150 * 1024; // prd.md §7 — per entry, which is what "the whole game" means
const DOCUMENT_BUDGET_BYTES = 40 * 1024; // the generated pages together, which carry no bundle at all
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
const ENTRIES = [
  { slug: 'candle', gameId: 'CandleGame', contract: 'Candle.sol', generated: 'Paytable.sol', multiAction: 'BURN is an on-chain player action' },
  { slug: 'survey', gameId: 'SurveyGame', contract: 'Survey.sol', generated: 'Manifest.sol', multiAction: 'SEND A SURVEYOR is an on-chain player action' },
  { slug: 'brokers', gameId: 'BrokersGame', contract: 'Brokers.sol', generated: 'Market.sol', multiAction: 'ASK is an on-chain player action' },
];
const GAMES = ENTRIES.map(entry => entry.slug);
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
for (const game of GAMES) {
  const html = await readFile(join(ROOT, game, 'index.html'), 'utf8');
  check(
    `${game}'s widget tag is a real <script src>, not injected by JS`,
    /<script[^>]+src=["']https:\/\/jam\.chain\.wtf\/widget\.js["']/.test(html),
    'the gallery reads the served document',
  );
}

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
for (const game of GAMES) {
  const built = join(DIST, game, 'index.html');
  const head = existsSync(built) ? await readFile(built, 'utf8') : await readFile(join(ROOT, game, 'index.html'), 'utf8');
  const favicon = /rel="icon"\s+href="(data:image\/svg\+xml,[^"]+)"/.exec(head);
  check(
    `${game}: a favicon is inlined, so nothing 404s in a console a judge has open`,
    favicon !== null,
    favicon ? `${Buffer.byteLength(favicon[1] ?? '')} bytes, no extra request` : '',
  );
  check(`${game}: it is well under the 8 KB image budget`, Buffer.byteLength(favicon?.[1] ?? '') < 8 * 1024);
  // A stray tag outside the href — this happened once, and the page shipped with
  // raw SVG markup loose in its <head>.
  check(`${game}: nothing spilled out of the favicon href`, !/<\/svg>"?\s*<(rect|path|circle)/i.test(head));
  check(`${game}: the page says what it is when its URL is pasted somewhere`, /og:title/.test(head) && /og:description/.test(head));
  check(`${game}: a theme colour is set, so browser chrome matches the room`, /name="theme-color"/.test(head));
  check(`${game}: the document declares a language`, /<html[^>]+lang="/.test(head));
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

// ------------------------------------------------------------- the how pages
/**
 * One "How it works" page per entry, generated by `npm run gen:pages`.
 *
 * They are the separate pages the List links to, and the thing to hold about
 * them is what they are NOT: not entries, so no widget and no manifest; and not
 * applications, so no script at all. A document that needs a framework to print
 * a table is a document that can break, and these are the pages a judge reads to
 * decide whether the numbers are real.
 */
console.log('\n\x1b[1mthe how pages\x1b[0m');
for (const game of GAMES) {
  const path = join(ROOT, 'public', game, 'how', 'index.html');
  if (!existsSync(path)) {
    check(`public/${game}/how/index.html exists`, false, 'run npm run gen:pages');
    continue;
  }
  const html = await readFile(path, 'utf8');
  check(`public/${game}/how/index.html exists and is marked generated`, /GENERATED by npm run gen:pages/.test(html));
  check(
    `${game}'s how page carries NO widget — it is not an entry`,
    countIn(html) === 0,
    'the widget marks a submission, and this page is not submitted',
  );
  check(
    `${game}'s how page ships no JavaScript at all`,
    !/<script/i.test(html),
    'a document that needs a framework to print a table is one that can break',
  );
  check(`${game}'s how page links back to the list`, /href="\/"/.test(html));
  check(`${game}'s how page links into the game`, new RegExp(`href="/${game}/"`).test(html));
  // The declared RTP is the one number a judge checks, so it has to be ON the
  // page rather than merely computable from it.
  check(
    `${game}'s how page prints a declared return and its exact fraction`,
    /Returns, played best/.test(html) && /Exactly \d+ \/ \d+/.test(html),
  );
}
check(
  'one stylesheet serves all three, rather than three copies of it',
  existsSync(join(ROOT, 'public', 'how.css')),
  'public/how.css',
);

// ---------------------------------------------------------------- manifest
console.log('\n\x1b[1mmanifests\x1b[0m');
for (const entry of ENTRIES) {
  // The host resolves a manifest with `new URL('game.manifest.json', gameUrl)`,
  // so each entry needs its own, beside its own page, under that exact name.
  const manifest = JSON.parse(await readFile(join(ROOT, 'public', entry.slug, 'game.manifest.json'), 'utf8'));
  check(`${entry.slug}: game.manifest.json parses`, true);
  check(`${entry.slug}: schemaVersion/apiVersion are 1`, manifest.schemaVersion === 1 && manifest.apiVersion === 1);
  check(`${entry.slug}: gameId matches the contract name`, manifest.gameId === entry.gameId, manifest.gameId);
  check(`${entry.slug}: defaultLocale exists in locales`, Boolean(manifest.locales?.[manifest.defaultLocale]?.name));
  check(`${entry.slug}: capabilities.openSession is true`, manifest.capabilities?.openSession === true);
  check(
    `${entry.slug}: capabilities.submitAction is true (it is multi-action)`,
    manifest.capabilities?.submitAction === true,
    entry.multiAction,
  );
}
check(
  'no two entries claim the same gameId',
  new Set(ENTRIES.map(e => e.gameId)).size === ENTRIES.length,
  'the host keys a game by it',
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

  for (const entry of ENTRIES) {
    const source = await readFile(join(ROOT, 'contracts', entry.contract), 'utf8').catch(() => '');
    check(`${entry.contract} imports the interface by a path that resolves anywhere`, /from '\.\/ICasinoGameV2\.sol'/.test(source));
    check(
      `${entry.generated} is generated, never hand-edited`,
      /GENERATED FILE — DO NOT EDIT/.test(await readFile(join(ROOT, 'contracts', 'generated', entry.generated), 'utf8').catch(() => '')),
    );
    check(`${entry.contract} declares no constructor arguments`, !/constructor\s*\([^)]+\)/.test(source), 'the SDK deploys it without any');
    check(`${entry.contract}: every hook is view, so the game holds no storage`, (source.match(/external\s+pure\s+returns/g) ?? []).length >= 5);
    check(`${entry.contract}: no unbounded loop in a settlement path`, !/while\s*\(\s*true\s*\)/.test(source), 'claude.md §3');
  }
}

// ---------------------------------------------------------------- generated docs
console.log('\n\x1b[1mgenerated documents\x1b[0m');
{
  // README.md is written from the DP. A stale one is worse than none, because a
  // reviewer who spots a mismatch cannot tell whether the build is wrong or the
  // document is (claude.md §8).
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8').catch(() => '');
  check('README.md exists and is marked generated', /GENERATED FILE — DO NOT EDIT/.test(readme));
  check(
    "README.md carries CANDLE's declared RTP as an exact rational",
    readme.includes('7577820426157 / 7812500000000'),
    'the one number a judge will check',
  );
  check(
    "and THE SURVEY's as well",
    readme.includes('60883787 / 62500000'),
    'every entry is submitted, so every number is published',
  );
  check("and THE BROKERS'", readme.includes('1551418623 / 1600000000'));
  check('README.md publishes the whole strategy band, not just the flattering end', readme.includes('93.577%'));
  check(
    'and says of each row whether it lands in the jam window',
    readme.includes('outside the window'),
    'three of the published policies do not, and a reader needs to be told which',
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
    const gzOf = async f => gzipSync(await readFile(f)).length;

    /**
     * What ONE visitor downloads for ONE page: the document, plus every local
     * script, stylesheet and image it references. Vite writes a modulepreload
     * link for each transitive chunk, so the document's own attributes are the
     * whole graph and nothing has to be walked.
     *
     * This gate used to sum every file in dist/ instead. That was the same
     * number back when the origin carried one game — and it silently stopped
     * being the same number when the second and third landed, because a CANDLE
     * player has never downloaded THE SURVEY's bundle. The budget in prd.md §7
     * and claude.md is "150 KB gzipped for the whole game", singular, so this
     * measures the whole game. The threshold has not moved.
     *
     * Measuring it per entry is also stricter where it matters: three games at
     * 49 KB each used to pass a 150 KB origin total while none of them could
     * have paid for a dependency, and one game at 140 KB now fails on its own
     * rather than hiding behind two small ones.
     */
    const downloadFor = async document_ => {
      const html = await readFile(document_, 'utf8');
      const refs = new Set(
        [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|svg))"/g)].map(m => m[1]),
      );
      let gz = await gzOf(document_);
      const missing = [];
      for (const ref of refs) {
        const on = join(DIST, ref);
        if (existsSync(on)) gz += await gzOf(on);
        else missing.push(ref);
      }
      return { gz, refs: refs.size, missing };
    };

    /** The pages a visitor can land on with a bundle behind them. */
    const ENTRY_PAGES = [
      { label: 'the door', at: join(DIST, 'index.html') },
      ...GAMES.map(game => ({ label: game, at: join(DIST, game, 'index.html') })),
    ];

    for (const page of ENTRY_PAGES) {
      if (!existsSync(page.at)) {
        check(`${page.label}: its page was built`, false, page.at.replace(DIST, 'dist'));
        continue;
      }
      const { gz, refs, missing } = await downloadFor(page.at);
      check(
        `${page.label} downloads < ${BUNDLE_BUDGET_BYTES / 1024} KB gzipped`,
        gz < BUNDLE_BUDGET_BYTES && missing.length === 0,
        missing.length
          ? `references nothing built: ${missing.join(', ')}`
          : `${(gz / 1024).toFixed(1)} KB over ${refs + 1} files`,
      );
    }

    /**
     * And the documents, which have no bundle behind them at all.
     *
     * They are governed as a SET rather than one at a time, because the way
     * they get expensive is not one page growing — every one of them is under
     * 2 KB — it is there being forty of them. This is the budget that says how
     * much of the origin the writing is allowed to be.
     */
    const entryPaths = new Set(ENTRY_PAGES.map(p => p.at));
    const documents = files.filter(f => extname(f) === '.html' && !entryPaths.has(f));
    const sheet = join(DIST, 'how.css');
    let documentsGz = existsSync(sheet) ? await gzOf(sheet) : 0;
    for (const d of documents) documentsGz += await gzOf(d);
    check(
      `the ${documents.length} generated documents together < ${DOCUMENT_BUDGET_BYTES / 1024} KB gzipped`,
      documentsGz < DOCUMENT_BUDGET_BYTES,
      `${(documentsGz / 1024).toFixed(1)} KB, one stylesheet and no script between them`,
    );

    // Reported, not gated: nobody downloads the origin, but a number that only
    // ever goes up is worth having in front of you.
    let originGz = 0;
    for (const f of files) {
      if (['.js', '.css', '.html'].includes(extname(f))) originGz += await gzOf(f);
    }
    console.log(
      `  \x1b[2m·\x1b[0m the whole origin weighs ${(originGz / 1024).toFixed(1)} KB gzipped` +
        `  \x1b[2m${ENTRY_PAGES.length} entries, ${documents.length} documents\x1b[0m`,
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

    /**
     * Every internal link lands on something that was built.
     *
     * The origin is twenty cross-linked pages now — a door, three games, the
     * verify sheet, and per game an about leaf plus four how leaves, each
     * carrying folio navigation and a prev/next turn. The bundle gate above
     * already resolves scripts, stylesheets and images; nothing resolved the
     * links BETWEEN the documents, which is the half a reader actually walks.
     * Renaming one leaf's `at` in gen-pages.ts is enough to strand a page, and
     * the site would build, gzip, pass and ship.
     */
    const documentPages = files.filter(f => extname(f) === '.html');
    const dead = [];
    let internal = 0;
    for (const page of documentPages) {
      const html = await readFile(page, 'utf8');
      for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const href = match[1];
        internal++;
        const target = href.endsWith('/') ? join(DIST, href, 'index.html') : join(DIST, href);
        if (!existsSync(target)) dead.push(`${page.replace(DIST, '')} -> ${href}`);
      }
    }
    check(
      `every internal link resolves to a page that was built`,
      dead.length === 0,
      dead.length ? dead.join(', ') : `${internal} links across ${documentPages.length} pages`,
    );
  }
}

// ---------------------------------------------------------------- live origin
if (origin) {
  console.log(`\n\x1b[1mlive origin — ${origin}\x1b[0m`);
  /**
   * Every entry, not just the first one. The header contract is served per
   * path, so checking `/candle/` and inferring the other two is exactly the
   * assumption that costs a gallery preview for the entry nobody re-read.
   */
  for (const { slug, gameId } of ENTRIES) {
    const gameUrl = new URL(`/${slug}/`, origin).toString();
    const res = await fetch(gameUrl, { redirect: 'follow' });
    const html = await res.text();
    const hdr = n => res.headers.get(n);
    check(`${slug}: the game page responds 200`, res.status === 200, gameUrl);
    check(`${slug}: CSP frame-ancestors * is served`, (hdr('content-security-policy') ?? '').includes('frame-ancestors *'), hdr('content-security-policy') ?? 'missing');
    check(`${slug}: NO X-Frame-Options is served`, hdr('x-frame-options') === null, hdr('x-frame-options') ?? 'absent');
    check(`${slug}: served HTML contains the widget tag exactly once`, countIn(html) === 1, `${countIn(html)} occurrence(s)`);
    const mres = await fetch(new URL(`/${slug}/game.manifest.json`, origin));
    const manifest = mres.ok ? await mres.json().catch(() => null) : null;
    check(`${slug}: game.manifest.json is live and parses`, Boolean(manifest), String(mres.status));
    check(`${slug}: and the live manifest names this entry's gameId`, manifest?.gameId === gameId, manifest?.gameId ?? 'missing');
  }

  // The door and the cross-entry verification page. Neither is an entry, and a
  // 404 on either is a broken link printed in the README.
  for (const path of ['/', '/verify/']) {
    const res = await fetch(new URL(path, origin).toString(), { redirect: 'follow' });
    const html = await res.text();
    check(`${path} responds 200`, res.status === 200, String(res.status));
    check(`${path} carries no jam widget — it is not an entry`, countIn(html) === 0, `${countIn(html)} occurrence(s)`);
  }
}

console.log(`\n${fail === 0 ? '\x1b[32mGATES GREEN\x1b[0m' : '\x1b[31mGATES RED\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
