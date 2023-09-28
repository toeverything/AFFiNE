import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const pluginOutputDir = resolve(rootDir, './apps/electron/dist/plugins');

export default defineConfig({
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
    },
  },
  define: {
    'process.env.PLUGIN_DIR': JSON.stringify(pluginOutputDir),
  },
  test: {
    include: ['./src/**/*.spec.ts'],
    exclude: ['**/node_modules', '**/dist', '**/build', '**/out'],
    testTimeout: 5000,
    singleThread: true,
    threads: false,
    coverage: {
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/electron'),
    },
  },
});
