import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2018',
  },
  plugins: [vanillaExtractPlugin()],
  test: {
    globalSetup: fileURLToPath(
      new URL('../../../scripts/vitest-global.js', import.meta.url)
    ),
    include: ['src/__tests__/**/*.unit.spec.ts'],
    testTimeout: 1000,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/blocksuite-affine',
    },
    /**
     * Custom handler for console.log in tests.
     *
     * Return `false` to ignore the log.
     */
    onConsoleLog(log, type) {
      if (
        log.includes('lit.dev/msg/dev-mode') ||
        log.includes(
          `KaTeX doesn't work in quirks mode. Make sure your website has a suitable doctype.`
        )
      ) {
        return false;
      }
      console.warn(`Unexpected ${type} log`, log);
      throw new Error(log);
    },
    environment: 'happy-dom',
  },
});
