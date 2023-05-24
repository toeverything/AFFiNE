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
        type: resolve(__dirname, 'src/type.ts'),
        manager: resolve(__dirname, 'src/manager.ts'),
      },
      name: 'ToEverythingPluginInfra',
    },
  },
  plugins: [dts()],
});
