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
import { WebpackS3Plugin } from './s3-plugin.js';

const IN_CI = !!process.env.CI;

export const rootPath = join(fileURLToPath(import.meta.url), '..', '..');
const workspaceRoot = join(rootPath, '..', '..', '..');

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
  if (typeof process.env.PUBLIC_PATH === 'string') {
    return process.env.PUBLIC_PATH;
  }
  const publicPath = '/';
  if (process.env.COVERAGE || buildFlags.distribution === 'desktop') {
    return publicPath;
  }

  if (BUILD_TYPE === 'canary') {
    return `https://dev.affineassets.com/`;
  } else if (BUILD_TYPE === 'beta' || BUILD_TYPE === 'stable') {
    return `https://prod.affineassets.com/`;
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
      assetModuleFilename:
        buildFlags.mode === 'production'
          ? 'assets/[name]-[contenthash:8][ext][query]'
          : '[name][ext]',
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
        ? 'source-map'
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
      alias: {
        yjs: require.resolve('yjs'),
        '@blocksuite/block-std': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'framework', 'block-std', 'src')
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'block-std',
              'dist'
            ),
        '@blocksuite/blocks': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'blocks', 'src')
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'blocks',
              'dist'
            ),
        '@blocksuite/presets': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'presets', 'src')
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'presets',
              'dist'
            ),
        '@blocksuite/global': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'framework', 'global', 'src')
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'global',
              'dist'
            ),
        '@blocksuite/store/providers/broadcast-channel': blocksuiteBaseDir
          ? join(
              blocksuiteBaseDir,
              'packages',
              'framework',
              'store',
              'src/providers/broadcast-channel'
            )
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'store',
              'dist',
              'providers',
              'broadcast-channel.js'
            ),
        '@blocksuite/store': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'framework', 'store', 'src')
          : join(workspaceRoot, 'node_modules', '@blocksuite', 'store', 'dist'),
        '@blocksuite/inline': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'framework', 'inline', 'src')
          : join(
              workspaceRoot,
              'node_modules',
              '@blocksuite',
              'inline',
              'dist'
            ),
        '@blocksuite/lit': blocksuiteBaseDir
          ? join(blocksuiteBaseDir, 'packages', 'framework', 'lit', 'src')
          : join(workspaceRoot, 'node_modules', '@blocksuite', 'lit', 'dist'),
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
                },
              },
            },
            {
              test: /\.(png|jpg|gif|svg|webp|mp4)$/,
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
        'process.env.SHOULD_REPORT_TRACE': JSON.stringify(
          Boolean(process.env.SHOULD_REPORT_TRACE === 'true')
        ),
        'process.env.TRACE_REPORT_ENDPOINT': JSON.stringify(
          process.env.TRACE_REPORT_ENDPOINT
        ),
        'process.env.CAPTCHA_SITE_KEY': JSON.stringify(
          process.env.CAPTCHA_SITE_KEY
        ),
        'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN),
        'process.env.BUILD_TYPE': JSON.stringify(process.env.BUILD_TYPE),
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
      client: {
        overlay: process.env.DISABLE_DEV_OVERLAY === 'true' ? false : undefined,
      },
      historyApiFallback: true,
      static: {
        directory: resolve(rootPath, 'public'),
        publicPath: '/',
        watch: true,
      },
      proxy: [
        {
          context: '/api/worker/',
          target: 'https://affine.fail',
          changeOrigin: true,
          secure: false,
        },
        { context: '/api', target: 'http://localhost:3010' },
        { context: '/socket.io', target: 'http://localhost:3010', ws: true },
        { context: '/graphql', target: 'http://localhost:3010' },
        { context: '/oauth', target: 'http://localhost:3010' },
      ],
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
