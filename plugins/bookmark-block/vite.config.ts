import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/server.ts'),
      fileName: 'server',
      formats: ['cjs'],
    },
    emptyOutDir: true,
    rollupOptions: {
      external: ['cheerio', 'electron', 'node:url'],
      output: {
        dir: resolve(
          rootDir,
          '..',
          '..',
          'apps',
          'electron',
          'dist',
          'plugins',
          'bookmark-block'
        ),
      },
    },
  },
});
