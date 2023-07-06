import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: {
        type: resolve(root, 'src/type.ts'),
        manager: resolve(root, 'src/manager.ts'),
      },
    },
    rollupOptions: {
      external: [
        'jotai',
        'jotai/vanilla',
        '@blocksuite/blocks',
        '@blocksuite/store',
        '@blocksuite/global',
        '@blocksuite/editor',
        '@blocksuite/lit',
      ],
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
