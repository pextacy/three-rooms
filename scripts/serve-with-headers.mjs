/**
 * Serves dist/ with the headers from vercel.json applied.
 *
 * Phase 0 needs the header invariant (I8) provable before there is a Vercel
 * project to deploy to. This applies the SAME config file Vercel will read, so
 * a green run here means the config is right — it does NOT prove the live
 * origin, which is phase 5's job (`npm run gates -- --origin https://…`).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4300);

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const headersFor = pathname => {
  const out = {};
  for (const rule of vercel.headers ?? []) {
    // vercel `source` is a path-to-regexp pattern; "/(.*)" is the only one we use.
    const re = new RegExp('^' + rule.source.replace(/\/\(\.\*\)$/, '/.*') + '$');
    if (re.test(pathname)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  let file = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));

  try {
    let s = await stat(file).catch(() => null);
    // A directory serves its own index. This is a multi-PAGE site, not an SPA:
    // `/` is the lobby and `/candle/` is an entry, and neither may fall back to
    // the other.
    if (s?.isDirectory()) {
      file = join(file, 'index.html');
      pathname = `${pathname.replace(/\/$/, '')}/index.html`;
      s = await stat(file).catch(() => null);
    }
    if (!s) {
      file = join(DIST, 'index.html');
      pathname = '/index.html';
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      ...headersFor(pathname),
    });
    res.end(body);
  } catch {
    res.writeHead(404, headersFor(pathname));
    res.end('not found');
  }
}).listen(PORT, () => console.log(`dist/ + vercel.json headers on http://localhost:${PORT}`));
