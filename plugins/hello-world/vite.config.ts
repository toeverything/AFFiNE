import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: resolve(
      root,
      '..',
      '..',
      'apps',
      'core',
      'public',
      'plugins',
      'hello-world'
    ),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: {
        index: resolve(root, 'src/index.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        '@blocksuite/icons',
        '@toeverything/plugin-infra/manager',
        /^react/,
        /^react-dom/,
      ],
    },
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
