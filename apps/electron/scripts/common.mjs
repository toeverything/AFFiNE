import { resolve } from 'node:path';

import { fileURLToPath } from 'url';

export const electronDir = fileURLToPath(new URL('..', import.meta.url));

export const rootDir = resolve(electronDir, '..', '..');

export const NODE_MAJOR_VERSION = 18;

// hard-coded for now:
// fixme(xp): report error if app is not running on DEV_SERVER_URL
const DEV_SERVER_URL = process.env.DEV_SERVER_URL;

/** @type 'production' | 'development'' */
const mode = (process.env.NODE_ENV = process.env.NODE_ENV || 'development');

/** @return {{layers: import('esbuild').BuildOptions}} */
export const config = () => {
  const define = Object.fromEntries([
    ['process.env.NODE_ENV', `"${mode}"`],
    ['process.env.USE_WORKER', '"true"'],
  ]);

  if (DEV_SERVER_URL) {
    define['process.env.DEV_SERVER_URL'] = `"${DEV_SERVER_URL}"`;
  }

  return {
    layers: {
      entryPoints: [
        resolve(electronDir, './src/main/index.ts'),
        resolve(electronDir, './src/preload/index.ts'),
        resolve(electronDir, './src/helper/index.ts'),
      ],
      entryNames: '[dir]',
      outdir: resolve(electronDir, './dist'),
      bundle: true,
      target: `node${NODE_MAJOR_VERSION}`,
      platform: 'node',
      external: [
        'electron',
        'electron-updater',
        '@toeverything/plugin-infra',
        'yjs',
      ],
      define: define,
      format: 'cjs',
      loader: {
        '.node': 'copy',
      },
      assetNames: '[name]',
      treeShaking: true,
    },
  };
};
