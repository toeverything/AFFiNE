import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.unit.spec.ts'],
    testTimeout: 500,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/global',
    },
    /**
     * Custom handler for console.log in tests.
     *
     * Return `false` to ignore the log.
     */
    onConsoleLog(log, type) {
      console.warn(`Unexpected ${type} log`, log);
      throw new Error(log);
    },
  },
});
