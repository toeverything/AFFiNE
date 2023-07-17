import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import HTMLPlugin from 'html-webpack-plugin';

import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

import { productionCacheGroups } from './cache-group.js';
import type { BuildFlags } from '@affine/cli/config';
import { projectRoot } from '@affine/cli/config';

const IN_CI = !!process.env.CI;

export const rootPath = fileURLToPath(new URL('..', import.meta.url));

const require = createRequire(rootPath);

const packages = [
  '@affine/component',
  '@affine/i18n',
  '@affine/debug',
  '@affine/env',
  '@affine/templates',
  '@affine/workspace',
  '@affine/jotai',
  '@affine/copilot',
  '@toeverything/hooks',
  '@toeverything/y-indexeddb',
];

const OptimizeOptionOptions: (
  buildFlags: BuildFlags
) => webpack.Configuration['optimization'] = buildFlags => ({
  minimize: buildFlags.mode === 'production',
  minimizer: [
    new TerserPlugin({
      parallel: true,
      extractComments: true,
      terserOptions: {
        parse: {
          ecma: 2019,
        },
        compress: {
          comparisons: false,
        },
        output: {
          comments: false,
          // https://github.com/facebookincubator/create-react-app/issues/2488
          ascii_only: true,
        },
      },
    }),
  ],
  removeEmptyChunks: true,
  providedExports: true,
  usedExports: true,
  sideEffects: true,
  removeAvailableModules: true,
  runtimeChunk: {
    name: 'runtime',
  },
  splitChunks: {
    chunks: 'all',
    minSize: 1,
    minChunks: 1,
    maxInitialRequests: Number.MAX_SAFE_INTEGER,
    maxAsyncRequests: Number.MAX_SAFE_INTEGER,
    cacheGroups:
      buildFlags.mode === 'production'
        ? productionCacheGroups
        : {
            default: false,
            vendors: false,
          },
  },
});

export const createConfiguration: (
  buildFlags: BuildFlags
) => webpack.Configuration = buildFlags => {
  let publicPath = process.env.PUBLIC_PATH ?? '/';

  return {
    name: 'affine',
    // to set a correct base path for source map
    context: projectRoot,
    output: {
      environment: {
        module: true,
        dynamicImport: true,
      },
      filename: 'js/[name].js',
      // In some cases webpack will emit files starts with "_" which is reserved in web extension.
      chunkFilename: 'js/chunk.[name].js',
      assetModuleFilename: 'assets/[hash][ext][query]',
      devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]',
      hotUpdateChunkFilename: 'hot/[id].[fullhash].js',
      hotUpdateMainFilename: 'hot/[runtime].[fullhash].json',
      path: join(rootPath, 'dist'),
      clean: buildFlags.mode === 'production',
      globalObject: 'globalThis',
      publicPath,
    },
    target: ['web', 'es2022'],

    mode: buildFlags.mode,

    devtool:
      buildFlags.mode === 'production'
        ? 'hidden-nosources-source-map'
        : 'eval-cheap-module-source-map',

    resolve: {
      extensionAlias: {
        '.js': ['.js', '.tsx', '.ts'],
        '.mjs': ['.mjs', '.mts'],
      },
      extensions: ['.js', '.ts', '.tsx'],
    },

    module: {
      parser: {
        javascript: {
          // Treat as missing export as error
          strictExportPresence: true,
        },
      },
      rules: [
        {
          test: /\.m?js?$/,
          resolve: {
            fullySpecified: false,
          },
        },
        {
          include: require.resolve('serialize-javascript'),
          sideEffects: false,
        },
        {
          oneOf: [
            {
              test: /\.tsx?$/,
              // Compile all ts files in the workspace
              include: resolve(rootPath, '..', '..'),
              loader: require.resolve('swc-loader'),
              options: {
                // https://swc.rs/docs/configuring-swc/
                jsc: {
                  preserveAllComments: true,
                  parser: {
                    syntax: 'typescript',
                    dynamicImport: true,
                    tsx: true,
                  },
                  target: 'es2022',
                  externalHelpers: true,
                  transform: {
                    react: {
                      runtime: 'automatic',
                      refresh: {
                        refreshReg: '$RefreshReg$',
                        refreshSig: '$RefreshSig$',
                        emitFullSignatures: true,
                      },
                    },
                  },
                  experimental: {
                    keepImportAssertions: true,
                  },
                },
              },
            },
            {
              test: /\.svg$/,
              use: [
                'thread-loader',
                {
                  loader: '@svgr/webpack',
                  options: {
                    icon: true,
                  },
                },
              ],
              exclude: [/node_modules/],
            },
            {
              test: /\.(png|jpg|gif|svg|webp)$/,
              type: 'asset/resource',
            },
            {
              test: /\.(ttf|eot|woff|woff2)$/i,
              type: 'asset/resource',
            },
            {
              test: /\.txt$/,
              loader: 'raw-loader',
            },
          ],
        },
      ],
    },

    plugins: [
      ...(IN_CI ? [] : [new webpack.ProgressPlugin({ percentBy: 'entries' })]),
      ...(buildFlags.mode === 'development'
        ? [new ReactRefreshWebpackPlugin({ overlay: false, esModule: true })]
        : []),
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'defer',
        minify: false,
        chunks: ['index'],
        filename: 'index.html',
      }),
    ],
    optimization: OptimizeOptionOptions(buildFlags),
  };
};
