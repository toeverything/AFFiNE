import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: {
        entry: resolve(root, 'src/entry.ts'),
        server: resolve(root, 'src/server.ts'),
      },
    },
    rollupOptions: {
      external: [/^jotai/, /^@blocksuite/, 'zod'],
    },
  },
  plugins: [dts()],
});
