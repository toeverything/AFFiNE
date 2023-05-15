import { resolve } from 'node:path';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';

/** @type {import('vite').UserConfig} */
export default {
  server: {
    port: 5174,
    open: false,
  },
  plugins: [react(), vanillaExtractPlugin()],
  cacheDir: resolve(__dirname, './.vite'),
};
