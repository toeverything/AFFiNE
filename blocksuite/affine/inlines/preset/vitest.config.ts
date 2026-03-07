import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2018',
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.unit.spec.ts'],
    testTimeout: 500,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/preset',
    },
    restoreMocks: true,
  },
});
