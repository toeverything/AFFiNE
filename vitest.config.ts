import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  assetsInclude: ['**/*.md'],
  resolve: {
    alias: {
      'next/router': 'next-router-mock',
      'next/config': resolve(rootDir, './scripts/vitest/next-config-mock.ts'),
    },
  },
  test: {
    setupFiles: [
      resolve(rootDir, './scripts/setup/search.ts'),
      resolve(rootDir, './scripts/setup/lottie-web.ts'),
    ],
    include: [
      'packages/**/*.spec.ts',
      'packages/**/*.spec.tsx',
      'apps/web/**/*.spec.ts',
      'apps/web/**/*.spec.tsx',
      'apps/electron/**/*.spec.ts',
      'tests/unit/**/*.spec.ts',
      'tests/unit/**/*.spec.tsx',
    ],
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: '.coverage/store',
    },
  },
});
