import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getBuildConfig } from '@affine/cli/src/webpack/runtime-config';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import type { BuildOptions, Plugin } from 'esbuild';

export const electronDir = fileURLToPath(new URL('..', import.meta.url));

export const rootDir = resolve(electronDir, '..', '..', '..', '..');

export const NODE_MAJOR_VERSION = 18;

export const mode = (process.env.NODE_ENV =
  process.env.NODE_ENV || 'development');

export const config = (): BuildOptions => {
  const define: Record<string, string> = {};

  define['REPLACE_ME_BUILD_ENV'] = `"${process.env.BUILD_TYPE ?? 'stable'}"`;

  define['BUILD_CONFIG'] = JSON.stringify(
    getBuildConfig({
      channel: (process.env.BUILD_TYPE as any) ?? 'canary',
      distribution: 'desktop',
      mode:
        process.env.NODE_ENV === 'production' ? 'production' : 'development',
      static: false,
    })
  );

  if (process.env.GITHUB_SHA) {
    define['process.env.GITHUB_SHA'] = `"${process.env.GITHUB_SHA}"`;
  }

  const plugins: Plugin[] = [];

  if (
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
  ) {
    plugins.push(
      sentryEsbuildPlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      })
    );
  }

  plugins.push({
    name: 'no-side-effects',
    setup(build) {
      build.onResolve({ filter: /\.js/ }, async args => {
        if (args.pluginData) return; // Ignore this if we called ourselves

        const { path, ...rest } = args;

        // mark all blocksuite packages as side-effect free
        // because they will include a lot of files that are not used in node_modules
        if (rest.resolveDir.includes('blocksuite')) {
          rest.pluginData = true; // Avoid infinite recursion
          const result = await build.resolve(path, rest);

          result.sideEffects = false;
          return result;
        }
        return null;
      });
    },
  });

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
    external: ['electron', 'electron-updater', 'yjs', 'semver'],
    format: 'cjs',
    loader: {
      '.node': 'copy',
    },
    define,
    assetNames: '[name]',
    treeShaking: true,
    sourcemap: 'linked',
    plugins,
  };
};
