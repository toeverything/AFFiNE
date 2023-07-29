import { ok } from 'node:assert';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  packageJsonInputSchema,
  packageJsonOutputSchema,
} from '@toeverything/plugin-infra/type';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { build } from 'vite';
import type { z } from 'zod';

import { projectRoot } from '../config/index.js';

const args = process.argv.splice(2);

const result = parseArgs({
  args,
  options: {
    watch: {
      type: 'boolean',
      default: false,
    },
    plugin: {
      type: 'string',
    },
  },
});

const plugin = result.values.plugin;

if (typeof plugin !== 'string') {
  throw new Error('plugin is required');
}

const isWatch = result.values.watch;
ok(typeof isWatch === 'boolean');

const external = [
  // built-in packages
  /^@affine/,
  /^@blocksuite/,
  /^@toeverything/,

  // react
  'react',
  /^react\//,
  /^react-dom/,

  // store
  /^jotai/,

  // css
  /^@vanilla-extract/,

  // remove this when bookmark plugin is ready
  'link-preview-js',
];

const allPluginDir = path.resolve(projectRoot, 'plugins');

const getPluginDir = (plugin: string) => path.resolve(allPluginDir, plugin);
const pluginDir = getPluginDir(plugin);
const packageJsonFile = path.resolve(pluginDir, 'package.json');

const json: z.infer<typeof packageJsonInputSchema> = await readFile(
  packageJsonFile,
  {
    encoding: 'utf-8',
  }
)
  .then(text => JSON.parse(text))
  .then(async json => {
    const result = await packageJsonInputSchema.safeParseAsync(json);
    if (result.success) {
      return json;
    } else {
      throw new Error('invalid package.json', result.error);
    }
  });

type Metadata = {
  assets: Set<string>;
};

const metadata: Metadata = {
  assets: new Set(),
};

const outDir = path.resolve(projectRoot, 'apps', 'core', 'public', 'plugins');

const coreOutDir = path.resolve(outDir, plugin);

const serverOutDir = path.resolve(
  projectRoot,
  'apps',
  'electron',
  'dist',
  'plugins',
  plugin
);

const coreEntry = path.resolve(pluginDir, json.affinePlugin.entry.core);
if (json.affinePlugin.entry.server) {
  const serverEntry = path.resolve(pluginDir, json.affinePlugin.entry.server);
  await build({
    build: {
      watch: isWatch ? {} : undefined,
      minify: false,
      outDir: serverOutDir,
      emptyOutDir: true,
      lib: {
        entry: serverEntry,
        fileName: 'index',
        formats: ['cjs'],
      },
      rollupOptions: {
        external,
      },
    },
  });
}

await build({
  build: {
    watch: isWatch ? {} : undefined,
    minify: false,
    outDir: coreOutDir,
    emptyOutDir: true,
    lib: {
      entry: coreEntry,
      fileName: 'index',
      formats: ['cjs'],
    },
    rollupOptions: {
      output: {
        assetFileNames: chunkInfo => {
          if (chunkInfo.name) {
            metadata.assets.add(chunkInfo.name);
            return chunkInfo.name;
          } else {
            throw new Error('no name');
          }
        },
        manualChunks: () => 'plugin',
      },
      external,
    },
  },
  plugins: [
    vanillaExtractPlugin(),
    react(),
    {
      name: 'generate-package.json',
      async generateBundle() {
        const packageJson = {
          name: json.name,
          version: json.version,
          description: json.description,
          affinePlugin: {
            release: json.affinePlugin.release,
            entry: {
              core: 'index.js',
            },
            assets: [...metadata.assets],
          },
        };
        packageJsonOutputSchema.parse(packageJson);
        this.emitFile({
          type: 'asset',
          fileName: 'package.json',
          source: JSON.stringify(packageJson, null, 2),
        });
      },
    },
  ],
});
