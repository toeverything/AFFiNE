import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import HTMLPlugin from 'html-webpack-plugin';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';
import { PerfseePlugin } from '@perfsee/webpack';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';

import CopyPlugin from 'copy-webpack-plugin';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

import { productionCacheGroups } from './cache-group.js';
import type { BuildFlags } from '@affine/cli/config';
import { projectRoot } from '@affine/cli/config';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import { computeCacheKey } from './utils.js';
import type { RuntimeConfig } from '@affine/env/global';

const IN_CI = !!process.env.CI;

export const rootPath = fileURLToPath(new URL('..', import.meta.url));

const require = createRequire(rootPath);

const OptimizeOptionOptions: (
  buildFlags: BuildFlags
) => webpack.Configuration['optimization'] = buildFlags => ({
  minimize: buildFlags.mode === 'production',
  minimizer: [
    new TerserPlugin({
      minify: TerserPlugin.swcMinify,
      parallel: true,
      extractComments: true,
      terserOptions: {
        ecma: 2020,
        compress: {
          unused: true,
        },
        mangle: true,
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
  buildFlags: BuildFlags,
  runtimeConfig: RuntimeConfig
) => webpack.Configuration = (buildFlags, runtimeConfig) => {
  let publicPath = process.env.PUBLIC_PATH ?? '/';

  const cacheKey = computeCacheKey(buildFlags);

  const config = {
    name: 'affine',
    // to set a correct base path for the source map
    context: projectRoot,
    output: {
      environment: {
        module: true,
        dynamicImport: true,
      },
      filename:
        buildFlags.mode === 'production'
          ? 'js/[name]-[contenthash:8].js'
          : 'js/[name].js',
      // In some cases webpack will emit files starts with "_" which is reserved in web extension.
      chunkFilename: 'js/chunk.[name].js',
      assetModuleFilename: 'assets/[contenthash:8][ext][query]',
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
        ? buildFlags.distribution === 'desktop'
          ? 'inline-source-map'
          : 'hidden-nosources-source-map'
        : 'eval-cheap-module-source-map',

    resolve: {
      extensionAlias: {
        '.js': ['.js', '.tsx', '.ts'],
        '.mjs': ['.mjs', '.mts'],
      },
      extensions: ['.js', '.ts', '.tsx'],
    },

    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [fileURLToPath(import.meta.url)],
      },
      version: cacheKey,
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
                    topLevelAwait: false,
                    tsx: true,
                  },
                  target: 'es2022',
                  externalHelpers: true,
                  transform: {
                    react: {
                      runtime: 'automatic',
                      refresh: buildFlags.mode === 'development' && {
                        refreshReg: '$RefreshReg$',
                        refreshSig: '$RefreshSig$',
                        emitFullSignatures: true,
                      },
                    },
                  },
                  experimental: {
                    keepImportAssertions: true,
                    plugins: [
                      buildFlags.coverage && [
                        'swc-plugin-coverage-instrument',
                        {},
                      ],
                    ].filter(Boolean),
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
            {
              test: /\.css$/,
              use: [
                buildFlags.mode === 'development'
                  ? 'style-loader'
                  : MiniCssExtractPlugin.loader,
                {
                  loader: 'css-loader',
                  options: {
                    url: false,
                    sourceMap: false,
                    modules: false,
                    import: true,
                    importLoaders: 1,
                  },
                },
                {
                  loader: 'postcss-loader',
                  options: {
                    postcssOptions: {
                      config: resolve(
                        rootPath,
                        '.webpack',
                        'postcss.config.cjs'
                      ),
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    plugins: [
      ...(IN_CI ? [] : [new webpack.ProgressPlugin({ percentBy: 'entries' })]),
      ...(buildFlags.mode === 'development'
        ? [new ReactRefreshWebpackPlugin({ overlay: false, esModule: true })]
        : [
            new MiniCssExtractPlugin({
              filename: `[name].[contenthash:8].css`,
              ignoreOrder: true,
            }),
          ]),
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'defer',
        minify: false,
        chunks: ['index', 'plugin'],
        filename: 'index.html',
      }),
      new VanillaExtractPlugin(),
      new webpack.DefinePlugin({
        'process.env': JSON.stringify({}),
        runtimeConfig: JSON.stringify(runtimeConfig),
      }),
      new CopyPlugin({
        patterns: [
          { from: resolve(rootPath, 'public'), to: resolve(rootPath, 'dist') },
        ],
      }),
    ],

    optimization: OptimizeOptionOptions(buildFlags),

    devServer: {
      hot: 'only',
      liveReload: false,
      client: undefined,
      historyApiFallback: true,
      static: {
        directory: resolve(rootPath, 'public'),
        publicPath: '/',
      },
    } as DevServerConfiguration,
  } satisfies webpack.Configuration;

  if (buildFlags.mode === 'production' && process.env.PERFSEE_TOKEN) {
    config.devtool = 'hidden-nosources-source-map';
    config.plugins.push(
      new PerfseePlugin({
        project: 'affine-toeverything',
      })
    );
  }

  if (buildFlags.mode === 'development') {
    config.optimization = {
      ...config.optimization,
      minimize: false,
      runtimeChunk: false,
      splitChunks: {
        maxInitialRequests: Infinity,
        chunks: 'all',
        cacheGroups: {
          defaultVendors: {
            test: `[\\/]node_modules[\\/](?!.*vanilla-extract)`,
            priority: -10,
            reuseExistingChunk: true,
          },
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          styles: {
            name: 'styles',
            type: 'css/mini-extract',
            chunks: 'all',
            enforce: true,
          },
        },
      },
    };
  }

  if (
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT
  ) {
    config.plugins.push(
      sentryWebpackPlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      })
    );
  }

  return config;
};
