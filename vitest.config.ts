import path from 'node:path';

import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['packages/**/*.spec.ts', 'packages/**/*.spec.tsx'],
    testTimeout: 5000,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: '.coverage/store',
    },
  },
  resolve: {
    alias: {
      '@affine/store': path.resolve(
        fileURLToPath(new URL('packages/store', import.meta.url))
      ),
    },
  },
});
