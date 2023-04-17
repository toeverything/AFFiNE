import { resolve } from 'node:path';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  assetsInclude: ['**/*.md'],
  resolve: {
    alias: {
      'next/router': 'next-router-mock',
      'next/config': resolve('./scripts/vitest/next-config-mock.ts'),
    },
  },
  test: {
    setupFiles: ['./scripts/setup/search.ts', './scripts/setup/lottie-web.ts'],
    include: [
      'packages/**/*.spec.ts',
      'packages/**/*.spec.tsx',
      'apps/web/**/*.spec.ts',
      'apps/web/**/*.spec.tsx',
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
