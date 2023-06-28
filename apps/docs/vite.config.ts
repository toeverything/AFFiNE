import path from 'node:path';
import url from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'waku/config';

export default defineConfig({
  root: path.dirname(url.fileURLToPath(import.meta.url)),
  plugins: [vanillaExtractPlugin()],
  build: {
    target: 'esnext',
  },
});
