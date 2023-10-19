import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
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
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      output: {
        globals: {
          idb: 'idb',
          yjs: 'yjs',
          'y-provider': 'yProvider',
        },
      },
      external: ['idb', 'yjs', 'y-provider'],
    },
  },
  plugins: [
    dts({
      entryRoot: resolve(__dirname, 'src'),
    }),
  ],
});
