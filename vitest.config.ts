import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import * as fg from 'fast-glob';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vanillaExtractPlugin(),
    // https://github.com/vitejs/vite-plugin-react-swc/issues/85#issuecomment-2003922124
    swc.vite({
      jsc: {
        preserveAllComments: true,
        parser: {
          syntax: 'typescript',
          dynamicImport: true,
          tsx: true,
          decorators: true,
        },
        target: 'es2022',
        externalHelpers: false,
        transform: {
          react: {
            runtime: 'automatic',
          },
          useDefineForClassFields: false,
          decoratorVersion: '2022-03',
        },
      },
      sourceMaps: true,
      inlineSourcesContent: true,
    }),
  ],
  assetsInclude: ['**/*.md', '**/*.zip'],
  resolve: {
    alias: {
      // prevent tests using two different sources of yjs
      yjs: resolve(rootDir, 'node_modules/yjs'),
      '@affine/core': fileURLToPath(
        new URL('./packages/frontend/core/src', import.meta.url)
      ),
    },
  },
  test: {
    setupFiles: [
      resolve(rootDir, './scripts/setup/polyfill.ts'),
      resolve(rootDir, './scripts/setup/lit.ts'),
      resolve(rootDir, './scripts/setup/vi-mock.ts'),
      resolve(rootDir, './scripts/setup/global.ts'),
    ],
    include: [
      // rootDir cannot be used as a pattern on windows
      fg.convertPathToPattern(rootDir) +
        'packages/{common,frontend}/**/*.spec.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules',
      '**/dist',
      '**/build',
      '**/out,',
      '**/packages/frontend/apps/electron',
    ],
    testTimeout: 5000,
    coverage: {
      all: false,
      provider: 'istanbul', // or 'c8'
      reporter: ['lcov'],
      reportsDirectory: resolve(rootDir, '.coverage/store'),
    },
    server: {
      deps: {
        inline: ['@blocksuite/affine/blocks'],
      },
    },
  },
});
