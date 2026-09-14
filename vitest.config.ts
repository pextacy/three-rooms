import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only OUR tests. The downloaded SDK ships its own specs under sdk/ and they
    // are not this project's to run or to keep green.
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**', 'sdk/**', 'spikes/**'],
  },
});
