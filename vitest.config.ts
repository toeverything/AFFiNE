import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'next/router': 'next-router-mock',
      'next/config': path.resolve('./scripts/vitest/next-config-mock.ts'),
    },
  },
  test: {
    include: [
      'packages/**/*.spec.ts',
      'apps/web/**/*.spec.ts',
      'apps/web/**/*.spec.tsx',
    ],
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: '.coverage/store',
    },
  },
});
