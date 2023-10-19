import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  assetsInclude: ['**/*.md'],
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
      '**/frontend/electron',
    ],
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/store'),
    },
  },
});
