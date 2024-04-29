import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import * as fg from 'fast-glob';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react({
      tsDecorators: true,
    }),
    vanillaExtractPlugin(),
  ],
  assetsInclude: ['**/*.md', '**/*.zip'],
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
      '@affine/core': fileURLToPath(
        new URL('./packages/frontend/core/src', import.meta.url)
      ),
    },
  },
  test: {
    setupFiles: [
      resolve(rootDir, './scripts/setup/lit.ts'),
      resolve(rootDir, './scripts/setup/lottie-web.ts'),
      resolve(rootDir, './scripts/setup/global.ts'),
    ],
    include: [
      // rootDir cannot be used as a pattern on windows
      fg.convertPathToPattern(rootDir) +
        'packages/{common,frontend}/**/*.spec.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules',
      '**/dist',
      '**/build',
      '**/out,',
      '**/packages/frontend/electron',
    ],
    testTimeout: 5000,
    coverage: {
      all: false,
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/store'),
    },
  },
});
