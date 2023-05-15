import { resolve } from 'node:path';

import { fileURLToPath } from 'url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const NODE_MAJOR_VERSION = 18;

// hard-coded for now:
// fixme(xp): report error if app is not running on RENDERER_APP_URL
const RENDERER_APP_URL = (process.env.RENDERER_APP_URL =
  process.env.RENDERER_APP_URL || 'http://localhost:8080');

const RENDERER_SHELL_URL = (process.env.RENDERER_SHELL_URL =
  process.env.RENDERER_SHELL_URL || 'http://localhost:5174');

/** @type 'production' | 'development'' */
const mode = (process.env.NODE_ENV = process.env.NODE_ENV || 'development');

const nativeNodeModulesPlugin = {
  name: 'native-node-modules',
  setup(build) {
    // Mark native Node.js modules as external
    build.onResolve({ filter: /\.node$/, namespace: 'file' }, args => {
      return { path: args.path, external: true };
    });
  },
};

// List of env that will be replaced by esbuild
const ENV_MACROS = ['AFFINE_GOOGLE_CLIENT_ID', 'AFFINE_GOOGLE_CLIENT_SECRET'];

/** @return {{main: import('esbuild').BuildOptions, preload: import('esbuild').BuildOptions}} */
export const config = () => {
  const define = Object.fromEntries([
    ...ENV_MACROS.map(key => [
      'process.env.' + key,
      JSON.stringify(process.env[key] ?? ''),
    ]),
    ['process.env.NODE_ENV', `"${mode}"`],
  ]);

  if (RENDERER_APP_URL) {
    define['process.env.RENDERER_APP_URL'] = `"${RENDERER_APP_URL}"`;
  }

  if (RENDERER_SHELL_URL) {
    define['process.env.RENDERER_SHELL_URL'] = `"${RENDERER_SHELL_URL}"`;
  }

  return {
    main: {
      entryPoints: [
        resolve(root, './layers/main/src/index.ts'),
        resolve(root, './layers/main/src/exposed.ts'),
      ],
      outdir: resolve(root, './dist/layers/main'),
      bundle: true,
      target: `node${NODE_MAJOR_VERSION}`,
      platform: 'node',
      external: ['electron', 'yjs', 'better-sqlite3', 'electron-updater'],
      plugins: [nativeNodeModulesPlugin],
      define: define,
      format: 'cjs',
    },
    preload: {
      entryPoints: [resolve(root, './layers/preload/src/index.ts')],
      outdir: resolve(root, './dist/layers/preload'),
      bundle: true,
      target: `node${NODE_MAJOR_VERSION}`,
      platform: 'node',
      external: ['electron', '../main/exposed-meta'],
      plugins: [nativeNodeModulesPlugin],
      define: define,
    },
  };
};
