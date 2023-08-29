import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';
import { PerfseePlugin } from '@perfsee/webpack';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';

import CopyPlugin from 'copy-webpack-plugin';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { compact } from 'lodash-es';

import { productionCacheGroups } from './cache-group.js';
import type { BuildFlags } from '@affine/cli/config';
import { projectRoot } from '@affine/cli/config';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import type { RuntimeConfig } from '@affine/env/global';
import { WebpackS3Plugin, gitShortHash } from './s3-plugin.js';

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
      exclude: [/plugins\/.+\/.+\.js$/, /plugins\/.+\/.+\.mjs$/],
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

export const getPublicPath = (buildFlags: BuildFlags) => {
  const { BUILD_TYPE } = process.env;
  const publicPath = process.env.PUBLIC_PATH ?? '/';
  if (process.env.COVERAGE || buildFlags.distribution === 'desktop') {
    return publicPath;
  }

  if (BUILD_TYPE === 'canary') {
    return `https://dev.affineassets.com/${gitShortHash()}/`;
  } else if (BUILD_TYPE === 'beta' || BUILD_TYPE === 'stable') {
    return `https://prod.affineassets.com/${gitShortHash()}/`;
  }
  return publicPath;
};

export const createConfiguration: (
  buildFlags: BuildFlags,
  runtimeConfig: RuntimeConfig
) => webpack.Configuration = (buildFlags, runtimeConfig) => {
  const blocksuiteBaseDir = buildFlags.localBlockSuite;

  const config = {
    name: 'affine',
    // to set a correct base path for the source map
    context: projectRoot,
    experiments: {
      topLevelAwait: true,
      outputModule: false,
      syncWebAssembly: true,
    },
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
      chunkFilename:
        buildFlags.mode === 'production'
          ? 'js/chunk.[name]-[contenthash:8].js'
          : 'js/chunk.[name].js',
      assetModuleFilename: 'assets/[name]-[contenthash:8][ext][query]',
      devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]',
      hotUpdateChunkFilename: 'hot/[id].[fullhash].js',
      hotUpdateMainFilename: 'hot/[runtime].[fullhash].json',
      path: join(rootPath, 'dist'),
      clean: buildFlags.mode === 'production',
      globalObject: 'globalThis',
      publicPath: getPublicPath(buildFlags),
    },
    target: ['web', 'es2022'],

    mode: buildFlags.mode,

    devtool:
      buildFlags.mode === 'production'
        ? buildFlags.distribution === 'desktop'
          ? 'nosources-source-map'
          : 'source-map'
        : 'eval-cheap-module-source-map',

    resolve: {
      symlinks: true,
      extensionAlias: {
        '.js': ['.js', '.tsx', '.ts'],
        '.mjs': ['.mjs', '.mts'],
      },
      extensions: ['.js', '.ts', '.tsx'],
      fallback:
        blocksuiteBaseDir === undefined
          ? undefined
          : {
              events: false,
            },
      alias:
        blocksuiteBaseDir === undefined
          ? undefined
          : {
              yjs: require.resolve('yjs'),
              '@blocksuite/block-std': resolve(
                blocksuiteBaseDir,
                'packages',
                'block-std',
                'src'
              ),
              '@blocksuite/blocks': resolve(
                blocksuiteBaseDir,
                'packages',
                'blocks',
                'src'
              ),
              '@blocksuite/editor': resolve(
                blocksuiteBaseDir,
                'packages',
                'editor',
                'src'
              ),
              '@blocksuite/global': resolve(
                blocksuiteBaseDir,
                'packages',
                'global',
                'src'
              ),
              '@blocksuite/lit': resolve(
                blocksuiteBaseDir,
                'packages',
                'lit',
                'src'
              ),
              '@blocksuite/phasor': resolve(
                blocksuiteBaseDir,
                'packages',
                'phasor',
                'src'
              ),
              '@blocksuite/store/providers/broadcast-channel': resolve(
                blocksuiteBaseDir,
                'packages',
                'store',
                'src/providers/broadcast-channel'
              ),
              '@blocksuite/store': resolve(
                blocksuiteBaseDir,
                'packages',
                'store',
                'src'
              ),
              '@blocksuite/virgo': resolve(
                blocksuiteBaseDir,
                'packages',
                'virgo',
                'src'
              ),
            },
    },

    module: {
      parser: {
        javascript: {
          // Do not mock Node.js globals
          node: false,
          requireJs: false,
          import: true,
          // Treat as missing export as error
          strictExportPresence: true,
        },
      },
      rules: [
        {
          test: /\.m?js?$/,
          enforce: 'pre',
          use: [
            {
              loader: require.resolve('source-map-loader'),
              options: {
                filterSourceMappingUrl: (
                  _url: string,
                  resourcePath: string
                ) => {
                  return resourcePath.includes('@blocksuite');
                },
              },
            },
          ],
          resolve: {
            fullySpecified: false,
          },
        },
        {
          oneOf: [
            {
              test: /\.tsx?$/,
              exclude: /node_modules/,
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
                    decorators: true,
                  },
                  target: 'es2022',
                  externalHelpers: false,
                  transform: {
                    react: {
                      runtime: 'automatic',
                      refresh: buildFlags.mode === 'development' && {
                        refreshReg: '$RefreshReg$',
                        refreshSig: '$RefreshSig$',
                        emitFullSignatures: true,
                      },
                    },
                    useDefineForClassFields: false,
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
              test: /\.(ttf|eot|woff|woff2)$/,
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
                    url: true,
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
    plugins: compact([
      IN_CI ? null : new webpack.ProgressPlugin({ percentBy: 'entries' }),
      buildFlags.mode === 'development'
        ? new ReactRefreshWebpackPlugin({ overlay: false, esModule: true })
        : new MiniCssExtractPlugin({
            filename: `[name].[contenthash:8].css`,
            ignoreOrder: true,
          }),
      new VanillaExtractPlugin(),
      new webpack.DefinePlugin({
        'process.env': JSON.stringify({}),
        'process.env.COVERAGE': JSON.stringify(!!buildFlags.coverage),
        'process.env.NODE_ENV': JSON.stringify(buildFlags.mode),
        'process.env.SHOULD_REPORT_TRACE': `${Boolean(
          process.env.SHOULD_REPORT_TRACE
        )}`,
        'process.env.TRACE_REPORT_ENDPOINT': `"${process.env.TRACE_REPORT_ENDPOINT}"`,
        runtimeConfig: JSON.stringify(runtimeConfig),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: resolve(rootPath, 'public'),
            to: resolve(rootPath, 'dist'),
          },
        ],
      }),
      buildFlags.mode === 'production' && process.env.R2_SECRET_ACCESS_KEY
        ? new WebpackS3Plugin()
        : null,
    ]),

    optimization: OptimizeOptionOptions(buildFlags),

    devServer: {
      hot: 'only',
      liveReload: true,
      client: undefined,
      historyApiFallback: true,
      static: {
        directory: resolve(rootPath, 'public'),
        publicPath: '/',
        watch: true,
      },
      proxy: {
        '/api': 'http://localhost:3010',
        '/socket.io': {
          target: 'http://localhost:3010',
          ws: true,
        },
        '/graphql': 'http://localhost:3010',
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
