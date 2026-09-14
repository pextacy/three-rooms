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

let html = await readFile(join(DIST, 'index.html'), 'utf8');
const assets = await readdir(join(DIST, 'assets'));

const js = assets.find(f => f.endsWith('.js'));
const css = assets.find(f => f.endsWith('.css'));
if (!js || !css) throw new Error('build first: npm run build');

const jsSource = await readFile(join(DIST, 'assets', js), 'utf8');
const cssSource = await readFile(join(DIST, 'assets', css), 'utf8');

const output = FRAGMENT
  ? [
      '<title>CANDLE</title>',
      `<style>${cssSource}</style>`,
      '<div id="root"></div>',
      `<script type="module">${jsSource}</script>`,
    ].join('\n')
  : html
      .replace(/<script async src="https:\/\/jam\.chain\.wtf\/widget\.js"><\/script>/, '')
      .replace(new RegExp(`<script type="module"[^>]*src="/assets/${js}"[^>]*></script>`), '')
      .replace(new RegExp(`<link rel="stylesheet"[^>]*href="/assets/${css}"[^>]*>`), `<style>${cssSource}</style>`)
      .replace('<div id="root"></div>', `<div id="root"></div><script type="module">${jsSource}</script>`);

await writeFile(OUT, output);
console.log(`${OUT}  ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB${FRAGMENT ? '  (artifact fragment)' : ''}`);
