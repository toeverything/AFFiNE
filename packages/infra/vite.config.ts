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
        index: resolve(root, 'src/index.ts'),
        atom: resolve(root, 'src/atom.ts'),
        type: resolve(root, 'src/type.ts'),
        'core/event-emitter': resolve(root, 'src/core/event-emitter.ts'),
        'preload/electron': resolve(root, 'src/preload/electron.ts'),
        '__internal__/workspace': resolve(
          root,
          'src/__internal__/workspace.ts'
        ),
        '__internal__/react': resolve(root, 'src/__internal__/react.ts'),
        '__internal__/plugin': resolve(root, 'src/__internal__/plugin.ts'),
      },
      formats: ['es', 'cjs'],
      name: 'AffineInfra',
    },
    rollupOptions: {
      external: [
        'electron',
        'async-call-rpc',
        'rxjs',
        'zod',
        'react',
        /^jotai/,
        /^@blocksuite/,
      ],
    },
  },
  plugins: [dts()],
});
