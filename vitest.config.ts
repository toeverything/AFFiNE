import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'next/router': 'next-router-mock',
    },
  },
  test: {
    include: [
      'packages/**/*.spec.ts',
      'apps/rem/**/*.spec.ts',
      'apps/rem/**/*.spec.tsx',
    ],
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: '.coverage/store',
    },
  },
});
