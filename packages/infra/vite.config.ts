import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(root, 'src/index.ts'),
      },
      formats: ['es', 'cjs'],
      name: 'AffineInfra',
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
