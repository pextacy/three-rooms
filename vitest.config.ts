import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const sdkFile = (name: string) => fileURLToPath(new URL(`./sdk/casino-sdk/src/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@chain/casino-sdk/guest': sdkFile('guest'),
      '@chain/casino-sdk/manifest': sdkFile('manifest'),
      '@chain/casino-sdk': sdkFile('types'),
    },
  },
  test: {
    // Only OUR tests. The downloaded SDK ships its own specs under sdk/ and they
    // are not this project's to run or to keep green.
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'sdk/**', 'spikes/**'],
    // Silences jsdom's "Not implemented: getContext" narration. It changes no
    // code path and costs no coverage — test/setup.ts says why.
    setupFiles: ['test/setup.ts'],
  },
});
