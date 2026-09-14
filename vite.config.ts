import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build. No SSR, no server middleware — the whole game is one HTML file
// plus one JS bundle, because the jam gallery reads the served document
// (docs.md §5.2) and the cold-open budget is 400 ms (prd.md §7).
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Everything in one chunk: a second request costs more than the bytes save.
    rollupOptions: { output: { manualChunks: undefined } },
    assetsInlineLimit: 8192, // matches the "no image over 8 KB" gate (I12)
    reportCompressedSize: true,
  },
  server: { port: 3200, strictPort: true },
  preview: { port: 3200, strictPort: true },
});
