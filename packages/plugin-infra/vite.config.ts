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
        type: resolve(root, 'src/type.ts'),
        manager: resolve(root, 'src/manager.ts'),
        '__internal__/workspace': resolve(
          root,
          'src/__internal__/workspace.ts'
        ),
        '__internal__/react': resolve(root, 'src/__internal__/react.ts'),
      },
    },
    rollupOptions: {
      external: ['react', /^jotai/, /^@blocksuite/],
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
