import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const pluginOutputDir = resolve(rootDir, './dist/plugins');

export default defineConfig({
  define: {
    'process.env.PLUGIN_DIR': JSON.stringify(pluginOutputDir),
  },
  test: {
    setupFiles: [resolve(rootDir, './scripts/setup/build-layers.ts')],
    environment: 'node',
    // split tests that include native addons or not
    include: ['./layers/**/*.spec.ts'],
    exclude: ['**/node_modules', '**/dist', '**/build', '**/out'],
    testTimeout: 5000,
    singleThread: true,
    threads: false,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '../../coverage'),
    },
  },
});
