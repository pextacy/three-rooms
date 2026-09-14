/**
 * Inlines the built app into ONE self-contained HTML file.
 *
 * The real deployment is the three-request build in dist/ — this is only for
 * handing someone a playable page where a bundler is not available (an Artifact,
 * a file: URL, an email attachment). The jam widget is dropped, because a
 * preview is not the submitted entry and must not report engagement as if it
 * were.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = process.argv[2] ?? join(ROOT, 'dist', 'candle-standalone.html');
/**
 * `--fragment` emits just <title>, <style>, the root div and the script — the
 * shape an Artifact wants, since the platform supplies the document skeleton.
 * Built directly rather than sliced out of the full page afterwards: the
 * minified bundle contains the literal text "</body>", so any post-hoc split on
 * it truncates the app.
 */
const FRAGMENT = process.argv.includes('--fragment');

let html = await readFile(join(DIST, 'candle', 'index.html'), 'utf8');
const assets = await readdir(join(DIST, 'assets'));

// The build splits shared code (React) from each page's own chunk, so the
// single-file bundle has to inline every asset the page actually references,
// in the order the document lists them.
const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(m => m[1]);
const js = referenced.filter(f => f?.endsWith('.js'));
const css = referenced.filter(f => f?.endsWith('.css'));
if (js.length === 0 || css.length === 0) throw new Error('build first: npm run build');

const jsSource = (await Promise.all(js.map(f => readFile(join(DIST, 'assets', f), 'utf8')))).join('\n');
const cssSource = (await Promise.all(css.map(f => readFile(join(DIST, 'assets', f), 'utf8')))).join('\n');

const output = FRAGMENT
  ? [
      '<title>CANDLE</title>',
      `<style>${cssSource}</style>`,
      '<div id="root"></div>',
      `<script type="module">${jsSource}</script>`,
    ].join('\n')
  : html
      .replace(/<script async src="https:\/\/jam\.chain\.wtf\/widget\.js"><\/script>/, '')
      .replace(/<script type="module"[^>]*src="\/assets\/[^"]+"[^>]*><\/script>/g, '')
      .replace(/<link rel="(?:stylesheet|modulepreload)"[^>]*href="\/assets\/[^"]+"[^>]*>/g, '')
      .replace('</head>', `<style>${cssSource}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root"></div><script type="module">${jsSource}</script>`);

await writeFile(OUT, output);
console.log(`${OUT}  ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB${FRAGMENT ? '  (artifact fragment)' : ''}`);
