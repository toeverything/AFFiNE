import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { StaticModuleRecord } from '@endo/static-module-record';
import {
  packageJsonInputSchema,
  packageJsonOutputSchema,
} from '@toeverything/plugin-infra/type';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { build, type PluginOption } from 'vite';
import type { z } from 'zod';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

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

const isWatch = command === 'dev';

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
        serverCommand: json.affinePlugin.serverCommand,
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
    react(),
    {
      name: 'parse-bundle',
      renderChunk(code, chunk) {
        if (chunk.fileName.endsWith('js')) {
          const record = new StaticModuleRecord(code, chunk.fileName);
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          const reexports = record.__reexportMap__ as Record<
            string,
            [localName: string, exportedName: string][]
          >;
          const exports = Object.assign(
            {},
            record.__fixedExportMap__,
            record.__liveExportMap__
          );
          this.emitFile({
            type: 'asset',
            fileName: `${chunk.fileName}.json`,
            source: JSON.stringify(
              {
                exports: exports,
                imports: record.imports,
                reexports: reexports,
              },
              null,
              2
            ),
          });
          return record.__syncModuleProgram__;
        }
        return code;
      },
    },
    generatePackageJson,
  ],
});

// step 2: generate server bundle
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
    plugins: [generatePackageJson],
  });
}
