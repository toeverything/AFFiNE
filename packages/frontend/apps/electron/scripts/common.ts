import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBuildConfig } from '@affine-tools/utils/build-config';
import { Package } from '@affine-tools/utils/workspace';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import type { BuildOptions, Plugin } from 'esbuild';
import esbuildPluginTsc from 'esbuild-plugin-tsc';

export const electronDir = fileURLToPath(new URL('..', import.meta.url));

export const rootDir = resolve(electronDir, '..', '..', '..', '..');

export const NODE_MAJOR_VERSION = 18;

export const mode = (process.env.NODE_ENV =
  process.env.NODE_ENV || 'development');

export const config = (): BuildOptions => {
  const define = {
    'process.env.GITHUB_SHA': process.env.GITHUB_SHA,
    'process.env.SENTRY_RELEASE': process.env.SENTRY_RELEASE,
    'process.env.SENTRY_DSN': process.env.SENTRY_DSN,
    'process.env.DEV_SERVER_URL': process.env.DEV_SERVER_URL,
    'process.env.NODE_ENV': process.env.NODE_ENV,
    REPLACE_ME_BUILD_ENV: process.env.BUILD_TYPE ?? 'stable',
    ...Object.entries(
      getBuildConfig(new Package('@affine/electron'), {
        mode:
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
        channel: (process.env.BUILD_TYPE as any) ?? 'canary',
      })
    ).reduce(
      (def, [key, val]) => {
        def[`BUILD_CONFIG.${key}`] = val;
        return def;
      },
      {} as Record<string, any>
    ),
  };

  const plugins: Plugin[] = [
    // ensures nestjs decorators are working (emitDecoratorMetadata not supported in esbuild)
    esbuildPluginTsc({
      tsconfigPath: resolve(electronDir, 'tsconfig.json'),
    }),
  ];

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
      resolve(electronDir, './src/entries/main/index.ts'),
      resolve(electronDir, './src/entries/preload/index.ts'),
      resolve(electronDir, './src/entries/helper/index.ts'),
    ],
    entryNames: '[dir]',
    outdir: resolve(electronDir, './dist'),
    bundle: true,
    target: `node${NODE_MAJOR_VERSION}`,
    platform: 'node',
    external: [
      'electron',
      'electron-updater',
      'yjs',
      'semver',
      // nestjs related:
      '@nestjs/platform-express',
      '@nestjs/microservices',
      '@nestjs/websockets/socket-module',
      '@apollo/subgraph',
      '@apollo/gateway',
      'ts-morph',
      'class-validator',
      'class-transformer',
    ],
    format: 'cjs',
    loader: {
      '.node': 'copy',
    },
    define: Object.entries(define).reduce(
      (def, [key, val]) => {
        def[key] =
          JSON.stringify(val) ??
          String(
            val
          ) /* JSON.stringify(undefined) == undefined, but we need 'undefined' */;
        return def;
      },
      {} as Record<string, string>
    ),
    assetNames: '[name]',
    treeShaking: true,
    sourcemap: 'linked',
    plugins,
  };
};
