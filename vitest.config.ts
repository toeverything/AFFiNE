import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

import { RollupPluginSwc } from './scripts/rollup-plugin-swc';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [vanillaExtractPlugin(), RollupPluginSwc()],
  assetsInclude: ['**/*.md'],
  esbuild: false,
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
    },
  },
  test: {
    setupFiles: [
      resolve(rootDir, './scripts/setup/lit.ts'),
      resolve(rootDir, './scripts/setup/lottie-web.ts'),
      resolve(rootDir, './scripts/setup/global.ts'),
    ],
    include: [
      resolve(rootDir, 'packages/common/**/*.spec.ts'),
      resolve(rootDir, 'packages/common/**/*.spec.tsx'),
      resolve(rootDir, 'packages/frontend/**/*.spec.ts'),
      resolve(rootDir, 'packages/frontend/**/*.spec.tsx'),
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
