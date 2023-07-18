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
        'core/event-emitter': resolve(root, 'src/core/event-emitter.ts'),
        'preload/electron': resolve(root, 'src/preload/electron.ts'),
      },
      formats: ['es', 'cjs'],
      name: 'AffineInfra',
    },
    rollupOptions: {
      external: ['electron', 'async-call-rpc', 'rxjs'],
    },
  },
  plugins: [dts()],
});
