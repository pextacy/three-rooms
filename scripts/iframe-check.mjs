/**
 * `npm run gates:iframe` — proves the built page can actually be embedded.
 *
 * The jam gallery renders every entry in a cross-origin iframe. If the origin
 * serves `X-Frame-Options`, or a CSP whose `frame-ancestors` excludes the
 * gallery, the entry still "works" at its own URL but shows pitch text in the
 * gallery — and nobody notices until judging (docs.md §5.3).
 *
 * So this serves dist/ with the real vercel.json headers on one port, a
 * cross-origin host page on another, and checks what a browser would check
 * before it decides whether to render the frame.
 *
 *   node scripts/iframe-check.mjs                 # against a local served build
 *   node scripts/iframe-check.mjs https://…       # against the live origin
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const target = process.argv[2] ?? null;
const LOCAL_PORT = 4311;
const HOST_PORT = 4312;

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
  ok ? pass++ : fail++;
};

/**
 * The rule a browser applies to `frame-ancestors`: `*` admits any ancestor, a
 * list admits only what it names, and `'none'` or `'self'` shuts the gallery out.
 */
function admitsAnyAncestor(csp) {
  if (!csp) return { ok: false, why: 'no Content-Security-Policy at all' };
  const directive = csp
    .split(';')
    .map(part => part.trim())
    .find(part => part.toLowerCase().startsWith('frame-ancestors'));
  if (!directive) return { ok: false, why: 'CSP present but no frame-ancestors directive' };
  const sources = directive.split(/\s+/).slice(1);
  if (sources.includes("'none'")) return { ok: false, why: "frame-ancestors 'none' — embedding is refused outright" };
  if (sources.includes('*')) return { ok: true, why: 'frame-ancestors *' };
  return { ok: false, why: `frame-ancestors is a fixed list (${sources.join(' ')}) — the gallery is not on it` };
}

let child = null;
let hostServer = null;

try {
  let origin = target;

  if (!origin) {
    child = spawn(process.execPath, [new URL('./serve-with-headers.mjs', import.meta.url).pathname], {
      env: { ...process.env, PORT: String(LOCAL_PORT) },
      stdio: 'ignore',
    });
    origin = `http://localhost:${LOCAL_PORT}`;
    for (let i = 0; i < 40; i++) {
      try {
        await fetch(origin);
        break;
      } catch {
        await sleep(50);
      }
    }
  }

  console.log(`\n\x1b[1mEmbeddability — every entry on the origin\x1b[0m`);
  console.log(`\x1b[2m${origin}\x1b[0m`);

  // The embeddable things are the GAME pages. `/` is the lobby and is not an
  // entry — the gallery never frames it, and it carries no widget.
  const ENTRIES = ['candle', 'survey'];
  let gameUrl = '';

  for (const slug of ENTRIES) {
    console.log(`\n  \x1b[1m/${slug}/\x1b[0m`);
    const url = new URL(`/${slug}/`, origin).toString();
    if (!gameUrl) gameUrl = url;
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    const header = name => res.headers.get(name);

    check(`${slug}: the game page responds 200`, res.status === 200, String(res.status));

    const csp = admitsAnyAncestor(header('content-security-policy'));
    check(`${slug}: CSP admits any ancestor`, csp.ok, csp.why);

    const xfo = header('x-frame-options');
    check(
      `${slug}: no X-Frame-Options is served`,
      xfo === null,
      xfo ?? 'absent — a stray SAMEORIGIN wins in some browsers and silently costs the gallery preview',
    );

    // A <meta http-equiv> CSP would be applied too, and frame-ancestors is
    // ignored in meta — worth catching, because it looks like it should work.
    check(
      `${slug}: frame-ancestors is not set via <meta>, where browsers ignore it`,
      !/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*frame-ancestors/i.test(html),
    );

    check(`${slug}: the document carries a #root for the app to mount into`, /<div id="root">/.test(html));
    check(`${slug}: the jam widget tag is present exactly once`, (html.match(/jam\.chain\.wtf\/widget\.js/g) ?? []).length === 1);

    // Resolved the way the host resolves it: relative to the GAME's url, not the
    // origin root. That is the whole reason each entry lives in its own folder.
    const manifest = await fetch(new URL('game.manifest.json', url));
    const parsed = manifest.ok ? await manifest.json().catch(() => null) : null;
    check(`${slug}: game.manifest.json resolves beside the page and parses`, Boolean(parsed), `${manifest.status}`);
    check(`${slug}: the manifest declares submitAction — it is multi-action`, parsed?.capabilities?.submitAction === true);
    check(`${slug}: the manifest names its own gameId`, typeof parsed?.gameId === 'string' && parsed.gameId.length > 0, parsed?.gameId);
  }

  // A real cross-origin embed, so the host page is genuinely a different origin.
  if (!target) {
    hostServer = createServer((_req, res2) => {
      res2.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const frames = ENTRIES.map(
        slug =>
          `<figure style="margin:0"><figcaption style="font:12px system-ui;color:#999">/${slug}/</figcaption>` +
          `<iframe src="${new URL(`/${slug}/`, origin).toString()}" width="420" height="620" style="border:1px solid #333"></iframe></figure>`,
      ).join('');
      res2.end(`<!doctype html><title>gallery stand-in</title>
<p style="font:14px system-ui">If both games render below, the headers are right.</p>
<div style="display:flex;gap:16px;flex-wrap:wrap">${frames}</div>`);
    });
    await new Promise(resolve => hostServer.listen(HOST_PORT, resolve));
    console.log(
      `\n  \x1b[2mA cross-origin stand-in for the gallery is at http://localhost:${HOST_PORT}` +
        `\n  Open it to confirm by eye; the header checks above are what a browser decides on.\x1b[0m`,
    );
    await sleep(400);
  }

  console.log(`\n${fail === 0 ? '\x1b[32mEMBEDDABLE\x1b[0m' : '\x1b[31mNOT EMBEDDABLE\x1b[0m'}  ${pass} passed, ${fail} failed\n`);
} finally {
  child?.kill();
  hostServer?.close();
}

process.exit(fail === 0 ? 0 : 1);
