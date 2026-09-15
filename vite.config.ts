import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Static build. No SSR, no server middleware — the whole game is one HTML file
// plus one JS bundle, because the jam gallery reads the served document
// (docs.md §5.2) and the cold-open budget is 400 ms (prd.md §7).
const sdkFile = (name: string) => fileURLToPath(new URL(`./sdk/casino-sdk/src/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The SDK is downloaded, not vendored (`npm run sdk:fetch`), so it is aliased
    // from source rather than installed as a dependency. Importing the SDK's own
    // bridge — instead of reimplementing 20 lines of penpal wiring — is the point.
    alias: {
      '@chain/casino-sdk/guest': sdkFile('guest'),
      '@chain/casino-sdk/manifest': sdkFile('manifest'),
      '@chain/casino-sdk': sdkFile('types'),
    },
  },
  build: {
    target: 'es2022',
    /**
     * One origin, several entries. The host resolves a manifest with
     * `new URL('game.manifest.json', gameUrl)` — relative to the GAME's url,
     * not the origin root — so each game lives in its own directory with its
     * own manifest beside it, and `/` is a lobby that is not an entry.
     */
    rollupOptions: {
      input: {
        lobby: fileURLToPath(new URL('./index.html', import.meta.url)),
        candle: fileURLToPath(new URL('./candle/index.html', import.meta.url)),
        survey: fileURLToPath(new URL('./survey/index.html', import.meta.url)),
        brokers: fileURLToPath(new URL('./brokers/index.html', import.meta.url)),
      },
      output: { manualChunks: undefined },
    },
    assetsInlineLimit: 8192, // matches the "no image over 8 KB" gate (I12)
    reportCompressedSize: true,
  },
  server: { port: 3200, strictPort: true },
  preview: { port: 3200, strictPort: true },
});
