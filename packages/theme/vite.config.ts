import { resolve } from 'node:path';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
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
        index: resolve(__dirname, 'src/index.ts'),
        css: resolve(__dirname, 'src/index.css.ts'),
      },
      name: 'ToEverythingTheme',
    },
  },
  plugins: [dts(), vanillaExtractPlugin()],
});
