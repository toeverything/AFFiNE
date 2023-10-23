import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { plugx } from '@plugxjs/vite-plugin';
import {
  packageJsonInputSchema,
  packageJsonOutputSchema,
} from '@toeverything/infra/type';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import vue from '@vitejs/plugin-vue';
import { build, type PluginOption } from 'vite';
import type { z } from 'zod';

const args = process.argv.splice(2);

const result = parseArgs({
  args,
  allowPositionals: true,
});

const plugin = process.cwd().split(path.sep).pop();
if (!plugin) {
  throw new Error('plugin name not found');
}

const command = result.positionals[0];

const isWatch = (() => {
  switch (command) {
    case 'dev': {
      return true;
    }
    case 'build': {
      return false;
    }
    default: {
      throw new Error('invalid command');
    }
  }
})();

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

  // utils
  'swr',

  // css
  /^@vanilla-extract/,
];

const pluginDir = process.cwd();

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

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
const outDir = path.resolve(
  projectRoot,
  'packages/frontend/core/public/plugins'
);

const coreOutDir = path.resolve(outDir, plugin);

const coreEntry = path.resolve(pluginDir, json.affinePlugin.entry.core);

const generatePackageJson: PluginOption = {
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
    } satisfies z.infer<typeof packageJsonOutputSchema>;
    packageJsonOutputSchema.parse(packageJson);
    this.emitFile({
      type: 'asset',
      fileName: 'package.json',
      source: JSON.stringify(packageJson, null, 2),
    });
  },
};

// step 1: generate core bundle
await build({
  build: {
    watch: isWatch ? {} : undefined,
    minify: false,
    target: 'esnext',
    outDir: coreOutDir,
    emptyOutDir: true,
    lib: {
      entry: coreEntry,
      fileName: 'index',
      formats: ['es'],
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
        chunkFileNames: chunkInfo => {
          if (chunkInfo.name) {
            const hash = createHash('md5')
              .update(
                Object.values(chunkInfo.moduleIds)
                  .map(m => m)
                  .join()
              )
              .digest('hex')
              .substring(0, 6);
            return `${chunkInfo.name}-${hash}.mjs`;
          } else {
            throw new Error('no name');
          }
        },
      },
      external,
    },
  },
  plugins: [
    vanillaExtractPlugin(),
    vue(),
    react(),
    plugx({
      staticJsonSuffix: '.json',
    }),
    generatePackageJson,
  ],
});
