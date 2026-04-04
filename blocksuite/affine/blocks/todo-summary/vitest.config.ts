import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2018',
  },
  test: {
    include: ['src/__tests__/**/*.unit.spec.ts'],
    environment: 'happy-dom',
    testTimeout: 1000,
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov'],
      reportsDirectory: '../../../.coverage/blocks-todo-summary',
    },
  },
});
