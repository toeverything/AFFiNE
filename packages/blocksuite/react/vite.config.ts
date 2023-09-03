import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    terserOptions: {
      ecma: 2020,
    },
    sourcemap: true,
    lib: {
      entry: {
        editor: resolve(__dirname, 'src/editor/index.tsx'),
      },
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      external: [
        'react-error-boundary',
        'react-dom',
        'react',
        'jotai',
        /^@blocksuite/,
        /^foxact/,
      ],
    },
  },
  plugins: [dts()],
});
