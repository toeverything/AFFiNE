import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
      '@affine/electron': resolve(rootDir, 'packages/frontend/electron/src'),
    },
  },
  test: {
    include: ['./test/**/*.spec.ts'],
    testTimeout: 5000,
    singleThread: true,
    threads: false,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/electron'),
    },
  },
});
