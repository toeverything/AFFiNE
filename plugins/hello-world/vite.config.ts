import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    minify: false,
    lib: {
      entry: {
        entry: resolve(root, 'src/entry.ts'),
      },
      formats: ['es'],
    },
    outDir: resolve(
      root,
      '..',
      '..',
      'apps',
      'web',
      'public',
      'plugins',
      'hello-world'
    ),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: resolve(root, 'package.json'),
          dest: '.',
        },
      ],
    }),
  ],
});
