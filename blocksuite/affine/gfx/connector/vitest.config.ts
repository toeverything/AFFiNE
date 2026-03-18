import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: {
    target: 'es2018',
  },
  test: {
    globalSetup: '../../../../scripts/vitest-global.js',
    include: ['src/**/__tests__/**/*.unit.spec.ts'],
    testTimeout: 1000,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../../.coverage/affine-gfx-connector',
    },
    onConsoleLog(log, type) {
      if (log.includes('https://lit.dev/msg/dev-mode')) {
        return false;
      }
      console.warn(`Unexpected ${type} log`, log);
      throw new Error(log);
    },
    environment: 'happy-dom',
  },
};
