import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    minify: 'esbuild',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'index',
      name: 'ToEverythingIndexedDBProvider',
    },
    rollupOptions: {
      external: ['idb', 'yjs'],
    },
  },
  plugins: [
    dts({
      entryRoot: resolve(__dirname, 'src'),
    }),
  ],
});
