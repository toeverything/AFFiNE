import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      '.',
      './packages/frontend/apps/electron',
      './blocksuite/**/*/vitest.config.ts',
    ],
  },
});
