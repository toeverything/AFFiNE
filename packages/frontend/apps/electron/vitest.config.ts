import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
      '@affine/electron': resolve(
        rootDir,
        'packages/frontend/apps/electron/src'
      ),
    },
  },

  test: {
    setupFiles: [resolve(rootDir, './scripts/setup/global.ts')],
    include: ['./test/**/*.spec.ts'],
    testTimeout: 5000,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/electron'),
    },
  },
});
