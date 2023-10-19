import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuildOptions } from 'esbuild';

export const electronDir = fileURLToPath(new URL('..', import.meta.url));

export const rootDir = resolve(electronDir, '..', '..', '..');

export const NODE_MAJOR_VERSION = 18;

export const mode = (process.env.NODE_ENV =
  process.env.NODE_ENV || 'development');

export const config = (): BuildOptions => {
  const define: Record<string, string> = {};

  define['REPLACE_ME_BUILD_ENV'] = `"${process.env.BUILD_TYPE ?? 'stable'}"`;

  return {
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
      'semver',
      'tinykeys',
    ],
    format: 'cjs',
    loader: {
      '.node': 'copy',
    },
    define,
    assetNames: '[name]',
    treeShaking: true,
    sourcemap: 'linked',
  };
};
