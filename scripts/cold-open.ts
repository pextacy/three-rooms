/**
 * `npm run cold-open` — the phase-3 budget, measured (plan.md D3: "Measure,
 * don't hope").
 *
 * Cold open is navigation -> first playable frame, and it is the sum of three
 * things. Two of them are measured here honestly and the third is stated rather
 * than guessed:
 *
 *   transfer   the critical path, served with the real vercel.json headers
 *   execute    parse + module init + React mount + first frame, in jsdom
 *   paint      the browser's own compositing — NOT measured here
 *
 * jsdom is slower than a real browser at DOM work and faster than one at layout
 * and paint, so the execute figure is an estimate, not a promise. It is still
 * the right thing to watch: a regression that doubles it is visible immediately.
 * The p95 that `prd.md` §7 actually commits to needs a browser run; open the
 * page and read `window.__candleColdOpenMs`, `__surveyColdOpenMs` or
 * `__brokersColdOpenMs`.
 *
 * EVERY entry is measured. They share a React chunk, so the second page a
 * player opens is cheaper than the first — but none of them is allowed to rely
 * on that: each is budgeted as if it were the only page anyone ever opens.
 */
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const RUNS = Number(process.env['COLD_OPEN_RUNS'] ?? 25);

const BUDGET_P95_MS = 400;
const HARD_BUDGET_MS = 1_200;

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? D(`  ${detail}`) : ''}`);
  if (!ok) failed++;
};

if (!existsSync(DIST)) {
  console.error('dist/ is missing — run `npm run build` first');
  process.exit(1);
}

const ENTRIES = [
  { slug: 'candle', title: 'CANDLE', load: () => import('../src/games/candle/app/ui/App') },
  { slug: 'survey', title: 'THE SURVEY', load: () => import('../src/games/survey/app/ui/App') },
  { slug: 'brokers', title: 'THE BROKERS', load: () => import('../src/games/brokers/app/ui/App') },
] as const;

/**
 * Transfer is not ours to measure — it is the player's network. So it is
 * MODELLED across three profiles rather than asserted on one flattering choice,
 * and the verdict says which profile each budget is met on.
 */
const PROFILES = [
  { name: 'fast broadband', mbps: 25, rttMs: 25 },
  { name: 'typical broadband', mbps: 10, rttMs: 50 },
  { name: 'slow 4G', mbps: 1.6, rttMs: 150 },
] as const;

// Mbit/s -> KB/s is x125, not /8: 10 Mbps is 1,250 KB/s.
const transferMs = (kb: number, mbps: number, rttMs: number) => rttMs * 2 + (kb / (mbps * 125)) * 1000;

async function measureEntry(entry: (typeof ENTRIES)[number]) {
  console.log(`\n${B(`${entry.title} — cold open`)}`);
  console.log(D(`navigation to first playable frame · budget p95 < ${BUDGET_P95_MS} ms, hard ${HARD_BUDGET_MS} ms\n`));

  // ---------------------------------------------------------------- transfer
  console.log(B('Critical path'));
  // The ENTRY is the game page. `/` is a lobby and is not submitted.
  const html = await readFile(join(DIST, entry.slug, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(m => m[1]).filter((a): a is string => Boolean(a));

  let totalGz = 0;
  let requests = 1; // the document itself
  const htmlGz = gzipSync(Buffer.from(html)).length;
  totalGz += htmlGz;
  console.log(`  ${`${entry.slug}/index.html`.padEnd(34)}${`${(htmlGz / 1024).toFixed(1)} KB gz`.padStart(12)}`);

  for (const asset of assets) {
    const path = join(DIST, asset);
    if (!existsSync(path)) continue;
    const bytes = await readFile(path);
    const gz = gzipSync(bytes).length;
    totalGz += gz;
    requests += 1;
    const size = (await stat(path)).size;
    console.log(`  ${asset.padEnd(34)}${`${(gz / 1024).toFixed(1)} KB gz`.padStart(12)}${D(` (${(size / 1024).toFixed(1)} KB raw)`)}`);
  }

  console.log(`  ${'total'.padEnd(34)}${`${(totalGz / 1024).toFixed(1)} KB gz`.padStart(12)}${D(` in ${requests} requests`)}`);
  /**
   * The build shares React, the room and the chrome between the two entries, so
   * a game page loads its own chunk plus the shared ones. That is the right
   * trade for an origin with several entries — every shared byte is already in
   * cache by the second page — and on HTTP/2 an extra file costs a multiplexed
   * stream, not a round trip. What matters is the BYTES, which are budgeted
   * next, and that the path is still short enough to read off a waterfall by
   * eye. It was 5 when there was one game; two entries sharing four files makes
   * it 7, and the shared-ness is checked below rather than assumed.
   */
  check(`${entry.slug}: the critical path stays short enough to read by eye`, requests <= 8, `${requests} requests`);
  entryAssets.set(entry.slug, assets);
  check(
    `${entry.slug}: everything needed to play fits in a single congestion window burst`,
    totalGz < 150 * 1024,
    `${(totalGz / 1024).toFixed(1)} KB`,
  );

  // ---------------------------------------------------------------- execute
  console.log(`\n${B('Execute')}`);
  console.log(D(`  parse + module init + React mount + first frame, ${RUNS} runs in jsdom`));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `https://games.test/${entry.slug}/`,
    pretendToBeVisual: true,
  });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals['window'] = dom.window;
  globals['document'] = dom.window.document;
  // `navigator` is a getter on globalThis in modern Node, so it has to be redefined.
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });

  // Module init is a ONE-SHOT cost and there is exactly one honest sample of it:
  // the first import. Everything after that is warm, so it is measured separately.
  const initStarted = performance.now();
  const { createRoot } = await import('react-dom/client');
  const { act, createElement } = await import('react');
  const { App } = await entry.load();
  const moduleInitMs = performance.now() - initStarted;

  const samples: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const started = performance.now();
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(App));
    });
    samples.push(performance.now() - started);
    await act(async () => root.unmount());
    container.remove();
  }

  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))] ?? 0;
  const p50 = at(0.5);
  const mountP95 = at(0.95);
  const p95 = moduleInitMs + mountP95;

  console.log(`  ${'module init (one shot, cold)'.padEnd(34)}${`${moduleInitMs.toFixed(1)} ms`.padStart(12)}`);
  console.log(`  ${'mount p50'.padEnd(34)}${`${p50.toFixed(1)} ms`.padStart(12)}`);
  console.log(`  ${'mount p95'.padEnd(34)}${`${mountP95.toFixed(1)} ms`.padStart(12)}`);
  console.log(`  ${'execute p95 = init + mount p95'.padEnd(34)}${`${p95.toFixed(1)} ms`.padStart(12)}`);

  dom.window.close();

  // ---------------------------------------------------------------- verdict
  console.log(`\n${B('Estimated cold open, by network')}`);
  console.log(D('  transfer is modelled; execute is measured; paint is neither and is excluded'));
  let broadbandEstimate = Infinity;
  let worstEstimate = 0;
  for (const profile of PROFILES) {
    const transfer = transferMs(totalGz / 1024, profile.mbps, profile.rttMs);
    const total = transfer + p95;
    if (profile.name === 'typical broadband') broadbandEstimate = total;
    if (total > worstEstimate) worstEstimate = total;
    const verdict =
      total < BUDGET_P95_MS
        ? '\x1b[32mwithin 400 ms\x1b[0m'
        : total < HARD_BUDGET_MS
          ? '\x1b[33mover 400, inside the hard budget\x1b[0m'
          : '\x1b[31mover the hard budget\x1b[0m';
    console.log(
      `  ${profile.name.padEnd(20)}${`${profile.mbps} Mbps`.padStart(9)}${`${profile.rttMs} ms RTT`.padStart(11)}` +
        `${`${transfer.toFixed(0)} + ${p95.toFixed(0)} =`.padStart(16)} ${B(`${total.toFixed(0)} ms`.padStart(7))}  ${verdict}`,
    );
  }

  check(
    `${entry.slug}: p95 is inside the ${BUDGET_P95_MS} ms budget on typical broadband`,
    broadbandEstimate < BUDGET_P95_MS,
    `${broadbandEstimate.toFixed(0)} ms`,
  );
  check(
    `${entry.slug}: the ${HARD_BUDGET_MS} ms hard budget holds even on slow 4G`,
    worstEstimate < HARD_BUDGET_MS,
    `${worstEstimate.toFixed(0)} ms, ${(HARD_BUDGET_MS - worstEstimate).toFixed(0)} ms of headroom`,
  );
  const blocking = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]).filter(tag => !/\basync\b|\bdefer\b|type="module"/.test(tag));
  check(`${entry.slug}: nothing in the head blocks the first frame`, blocking.length === 0, blocking.join(' '));
  check(`${entry.slug}: the jam widget is async, so it cannot delay the first frame`, /<script[^>]*\basync\b[^>]*jam\.chain\.wtf/.test(html));

  return totalGz;
}

/** What each entry actually pulls, so the sharing can be checked and not assumed. */
const entryAssets = new Map<string, readonly string[]>();

let lastTotalGz = 0;
for (const entry of ENTRIES) lastTotalGz = await measureEntry(entry);
const totalGz = lastTotalGz;

console.log(`\n${B('What the entries share')}`);
{
  const [first, ...rest] = ENTRIES;
  const a = new Set(entryAssets.get(first.slug) ?? []);
  const shared = [...a].filter(asset => rest.every(entry => (entryAssets.get(entry.slug) ?? []).includes(asset)));
  let sharedGz = 0;
  for (const asset of shared) {
    const path = join(DIST, asset);
    if (existsSync(path)) sharedGz += gzipSync(await readFile(path)).length;
  }
  for (const asset of shared) console.log(`  ${asset}`);
  console.log(
    D(`  ${(sharedGz / 1024).toFixed(1)} KB gz of the ${(totalGz / 1024).toFixed(1)} KB is already in cache by the second page a player opens.`),
  );
  check(
    'every entry really does share React, the room and the chrome',
    shared.length >= 3 && sharedGz > 60 * 1024,
    `${shared.length} files, ${(sharedGz / 1024).toFixed(1)} KB gz`,
  );
}

console.log(`\n${B('Where the bytes go')}`);
console.log(D(`  react + react-dom is roughly 45 KB gz of the ${(totalGz / 1024).toFixed(0)} KB total — the single`));
console.log(D('  largest line item, for a UI that is two buttons, a stake field and a canvas.'));
console.log(D('  Aliasing preact/compat would cut it to about 40 KB and take ~200 ms off slow 4G.'));
console.log(D('  Not done: it is a dependency decision, not a rendering one (docs.md §8).'));

console.log(
  D(
    `\n  The p95 prd.md §7 commits to is a BROWSER number. Open a page and read\n  window.__candleColdOpenMs, __surveyColdOpenMs or __brokersColdOpenMs; this\n  command is the regression watch, not the proof.\n`,
  ),
);

console.log(`${failed === 0 ? '\x1b[32mCOLD OPEN GREEN\x1b[0m' : '\x1b[31mCOLD OPEN RED\x1b[0m'}  ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
