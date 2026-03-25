import { cpus } from 'node:os';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import istanbul from 'vite-plugin-istanbul';
import wasm from 'vite-plugin-wasm';

import { hmrPlugin } from './scripts/hmr-plugin';

const enableIstanbul = !!process.env.COVERAGE;

export function sourcemapExclude(): Plugin {
  return {
    name: 'sourcemap-exclude',
    transform(code: string, id: string) {
      if (id.includes('node_modules') && !id.includes('@blocksuite')) {
        return {
          code,
          // https://github.com/rollup/rollup/blob/master/docs/plugin-development/index.md#source-code-transformations
          map: { mappings: '' },
        };
      }

      return undefined;
    },
  };
}

const clearSiteDataPlugin = () =>
  ({
    name: 'clear-site-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/Clear-Site-Data') {
          res.statusCode = 200;
          res.setHeader('Clear-Site-Data', '"*"');
        }
        next();
      });
    },
  }) as Plugin;

const lodashEsSpecifierPlugin = () =>
  ({
    name: 'lodash-es-specifier',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if (!id.startsWith('lodash-es/') || id.endsWith('.js')) {
        return null;
      }
      return this.resolve(`${id}.js`, importer, {
        ...options,
        skipSelf: true,
      });
    },
  }) as Plugin;

const atlaskitSpecifierPlugin = () =>
  ({
    name: 'atlaskit-specifier',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      const mapping: Record<string, string> = {
        '@atlaskit/pragmatic-drag-and-drop/element/adapter':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/adapter.js',
        '@atlaskit/pragmatic-drag-and-drop/element/center-under-pointer':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/center-under-pointer.js',
        '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/disable-native-drag-preview.js',
        '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/pointer-outside-of-preview.js',
        '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/preserve-offset-on-source.js',
        '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview':
          '@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/set-custom-native-drag-preview.js',
        '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element':
          '@atlaskit/pragmatic-drag-and-drop-auto-scroll/dist/cjs/entry-point/element.js',
        '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge':
          '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/cjs/closest-edge.js',
      };
      const replacement = mapping[id];
      if (!replacement) return null;
      return this.resolve(replacement, importer, {
        ...options,
        skipSelf: true,
      });
    },
  }) as Plugin;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, __dirname, '') };

  return {
    envDir: __dirname,
    define: {
      'import.meta.env.PLAYGROUND_SERVER': JSON.stringify(
        process.env.PLAYGROUND_SERVER ?? 'http://localhost:8787'
      ),
      'import.meta.env.PLAYGROUND_WS': JSON.stringify(
        process.env.PLAYGROUND_WS ?? 'ws://localhost:8787'
      ),
    },
    plugins: [
      lodashEsSpecifierPlugin(),
      atlaskitSpecifierPlugin(),
      hmrPlugin,
      sourcemapExclude(),
      enableIstanbul &&
        istanbul({
          cwd: fileURLToPath(new URL('../..', import.meta.url)),
          include: ['packages/**/src/*'],
          exclude: [
            'node_modules',
            'tests',
            fileURLToPath(new URL('.', import.meta.url)),
          ],
          forceBuildInstrument: true,
        }),
      wasm(),
      vanillaExtractPlugin(),
      clearSiteDataPlugin(),
    ],
    esbuild: {
      target: 'es2018',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        cache: false,
        maxParallelFileOps: Math.max(1, cpus().length - 1),
        onwarn(warning, defaultHandler) {
          if (
            warning.code &&
            ['EVAL', 'SOURCEMAP_ERROR'].includes(warning.code)
          ) {
            return;
          }

          defaultHandler(warning);
        },
        input: {
          main: resolve(__dirname, 'index.html'),
          'examples/inline': resolve(__dirname, 'examples/inline/index.html'),
        },
        treeshake: true,
        output: {
          sourcemapIgnoreList: relativeSourcePath => {
            const normalizedPath = path.normalize(relativeSourcePath);
            return normalizedPath.includes('node_modules');
          },
        },
      },
    },
  };
});
