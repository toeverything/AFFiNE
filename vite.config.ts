import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

const require = createRequire(import.meta.url);

const builtInPlugins = ['hello-world', 'bookmark', 'copilot'];

const outputJson: [pluginName: string, output: string][] = [];

const entry = builtInPlugins.reduce(
  (acc, plugin) => {
    const packageJson = require(resolve(
      root,
      'plugins',
      plugin,
      'package.json'
    ));
    const entry = packageJson.affinePlugin.entry.core;
    acc[`${plugin}/index`] = resolve(root, 'plugins', plugin, entry);
    packageJson.affinePlugin.entry.core = './index.js';
    outputJson.push([plugin, JSON.stringify(packageJson, null, 2)]);
    return acc;
  },
  {} as Record<string, string>
);

export default defineConfig({
  build: {
    outDir: resolve(root, 'apps', 'core', 'public', 'plugins'),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry,
      formats: ['cjs'],
    },
    rollupOptions: {
      output: {
        manualChunks: () => 'plugin',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
      external: [
        // built-in packages
        /^@affine/,
        /^@blocksuite/,
        /^@toeverything/,

        // react
        /^react/,
        /^react-dom/,

        // store
        /^jotai/,

        // css
        /^@vanilla-extract/,
      ],
      plugins: [
        vanillaExtractPlugin(),
        {
          name: 'generate-manifest',
          generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: `plugin-list.json`,
              source: JSON.stringify(
                builtInPlugins.map(plugin => ({
                  name: plugin,
                }))
              ),
            });
            outputJson.forEach(([name, json]) => {
              this.emitFile({
                type: 'asset',
                fileName: `${name}/package.json`,
                source: json,
              });
            });
          },
        },
      ],
    },
  },
  plugins: [react()],
});
