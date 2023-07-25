import { ok } from 'node:assert';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react-swc';
import { build } from 'vite';
import { z } from 'zod';

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

const packageJsonSchema = z.object({
  name: z.string(),
  affinePlugin: z.object({
    release: z.boolean(),
    entry: z.object({
      core: z.string(),
      server: z.string().optional(),
    }),
  }),
});

const external = [
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

  // remove this when bookmark plugin is ready
  'link-preview-js',
];

const allPluginDir = path.resolve(projectRoot, 'plugins');

const getPluginDir = (plugin: string) => path.resolve(allPluginDir, plugin);
const pluginDir = getPluginDir(plugin);
const packageJsonFile = path.resolve(pluginDir, 'package.json');

const json: z.infer<typeof packageJsonSchema> = await readFile(
  packageJsonFile,
  {
    encoding: 'utf-8',
  }
)
  .then(text => JSON.parse(text))
  .then(async json => {
    const { success } = await packageJsonSchema.safeParseAsync(json);
    if (success) {
      return json;
    } else {
      throw new Error('invalid package.json');
    }
  });

type Metadata = {
  assets: Set<string>;
};

const metadata: Metadata = {
  assets: new Set(),
};

const coreOutDir = path.resolve(
  projectRoot,
  'apps',
  'core',
  'public',
  'plugins',
  plugin
);

const serverOutDir = path.resolve(
  projectRoot,
  'apps',
  'electron',
  'dist',
  'plugins',
  plugin
);

const pluginListJsonPath = path.resolve(coreOutDir, '..', 'plugin-list.json');

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
      name: 'generate-list-json',
      async generateBundle() {
        const file = await open(pluginListJsonPath, 'as+');
        const txt = await file.readFile({
          encoding: 'utf-8',
        });
        if (!txt) {
          console.log('generate plugin-list.json');
          await file.write(
            JSON.stringify([
              {
                release: json.affinePlugin.release,
                name: plugin,
                assets: [...metadata.assets],
              },
            ])
          );
        } else {
          console.log('modify plugin-list.json');
          const list = JSON.parse(txt);
          const index = list.findIndex((item: any) => item.name === plugin);
          if (index === -1) {
            list.push({
              release: json.affinePlugin.release,
              name: plugin,
              assets: [...metadata.assets],
            });
          } else {
            list[index].assets = [...metadata.assets];
          }
          await file.write(JSON.stringify(list), 0);
        }
      },
    },
  ],
});
