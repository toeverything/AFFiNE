import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2018',
  },
  test: {
    globalSetup: fileURLToPath(
      new URL('../../../../scripts/vitest-global.js', import.meta.url)
    ),
    include: ['src/__tests__/**/*.unit.spec.ts'],
    testTimeout: 1000,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/affine-gfx-pointer',
    },
    onConsoleLog(log, type) {
      if (log.includes('lit.dev/msg/dev-mode')) {
        return false;
      }
      console.warn(`Unexpected ${type} log`, log);
      throw new Error(log);
    },
    environment: 'happy-dom',
  },
});
