import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: {
        maker: resolve(root, 'src/maker.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
      external: [
        '@electron-forge/maker-base',
        '@electron-forge/shared-types',
        /^node:/,
      ],
    },
  },
});
