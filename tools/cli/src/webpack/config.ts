import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BUILD_CONFIG_TYPE } from '@affine/env/global';
import { PerfseePlugin } from '@perfsee/webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import { compact } from 'lodash-es';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

import { projectRoot } from '../config/cwd.cjs';
import type { BuildFlags } from '../config/index.js';
import { productionCacheGroups } from './cache-group.js';
import { WebpackS3Plugin } from './s3-plugin.js';

const IN_CI = !!process.env.CI;

export const rootPath = join(fileURLToPath(import.meta.url), '..', '..');
export const workspaceRoot = join(rootPath, '..', '..', '..');

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

  if (process.env.COVERAGE || buildFlags.distribution === 'desktop') {
    return '/';
  }

  let publicPath: string;
  switch (buildFlags.distribution) {
    case 'admin':
      publicPath = '/admin/';
      break;
    case 'mobile':
      publicPath = '/mobile/';
      break;
    default:
      publicPath = '/';
  }

  let cdn: string;
  switch (BUILD_TYPE) {
    case 'stable':
      cdn = 'https://prod.affineassets.com';
      break;
    case 'beta':
      cdn = 'https://beta.affineassets.com';
      break;
    default:
      cdn = 'https://dev.affineassets.com';
  }

  if (buildFlags.mode === 'development') {
    return publicPath;
  }

  return cdn + publicPath;
};

export const createConfiguration: (
  cwd: string,
  buildFlags: BuildFlags,
  buildConfig: BUILD_CONFIG_TYPE
) => webpack.Configuration = (cwd, buildFlags, buildConfig) => {
  const config = {
    name: 'affine',
    // to set a correct base path for the source map
    context: cwd,
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
          ? 'js/[name].[contenthash:8].js'
          : 'js/[name].js',
      // In some cases webpack will emit files starts with "_" which is reserved in web extension.
      chunkFilename: pathData =>
        pathData.chunk?.name === 'worker'
          ? 'js/worker.[contenthash:8].js'
          : buildFlags.mode === 'production'
            ? 'js/chunk.[name].[contenthash:8].js'
            : 'js/chunk.[name].js',
      assetModuleFilename:
        buildFlags.mode === 'production'
          ? 'assets/[name].[contenthash:8][ext][query]'
          : '[name].[contenthash:8][ext]',
      devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]',
      hotUpdateChunkFilename: 'hot/[id].[fullhash].js',
      hotUpdateMainFilename: 'hot/[runtime].[fullhash].json',
      path: join(cwd, 'dist'),
      clean: buildFlags.mode === 'production',
      globalObject: 'globalThis',
      // NOTE(@forehalo): always keep it '/'
      publicPath: '/',
      workerPublicPath: '/',
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
      alias: {
        yjs: join(workspaceRoot, 'node_modules', 'yjs'),
        lit: join(workspaceRoot, 'node_modules', 'lit'),
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
          test: /\.js$/,
          enforce: 'pre',
          include: /@blocksuite/,
          use: ['source-map-loader'],
        },
        {
          oneOf: [
            {
              test: /\.ts$/,
              exclude: /node_modules/,
              loader: 'swc-loader',
              options: {
                // https://swc.rs/docs/configuring-swc/
                jsc: {
                  preserveAllComments: true,
                  parser: {
                    syntax: 'typescript',
                    dynamicImport: true,
                    topLevelAwait: false,
                    tsx: false,
                    decorators: true,
                  },
                  target: 'es2022',
                  externalHelpers: false,
                  transform: {
                    useDefineForClassFields: false,
                    decoratorVersion: '2022-03',
                  },
                },
                sourceMaps: true,
                inlineSourcesContent: true,
              },
            },
            {
              test: /\.tsx$/,
              exclude: /node_modules/,
              loader: 'swc-loader',
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
                    decoratorVersion: '2022-03',
                  },
                },
                sourceMaps: true,
                inlineSourcesContent: true,
              },
            },
            {
              test: /\.(png|jpg|gif|svg|webp|mp4|zip)$/,
              type: 'asset/resource',
            },
            {
              test: /\.(ttf|eot|woff|woff2)$/,
              type: 'asset/resource',
            },
            {
              test: /\.txt$/,
              type: 'asset/source',
            },
            {
              test: /\.inline\.svg$/,
              type: 'asset/inline',
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
                      config: join(rootPath, 'webpack', 'postcss.config.cjs'),
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
        ? new ReactRefreshWebpackPlugin({
            overlay: false,
            esModule: true,
            include: /\.tsx$/,
          })
        : // todo: support multiple entry points
          new MiniCssExtractPlugin({
            filename: `[name].[contenthash:8].css`,
            ignoreOrder: true,
          }),
      new VanillaExtractPlugin(),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(buildFlags.mode),
        'process.env.CAPTCHA_SITE_KEY': JSON.stringify(
          process.env.CAPTCHA_SITE_KEY
        ),
        'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN),
        'process.env.BUILD_TYPE': JSON.stringify(process.env.BUILD_TYPE),
        'process.env.MIXPANEL_TOKEN': JSON.stringify(
          process.env.MIXPANEL_TOKEN
        ),
        'process.env.DEBUG_JOTAI': JSON.stringify(process.env.DEBUG_JOTAI),
        ...Object.entries(buildConfig).reduce(
          (def, [k, v]) => {
            def[`BUILD_CONFIG.${k}`] = JSON.stringify(v);
            return def;
          },
          {} as Record<string, string>
        ),
      }),
      buildFlags.distribution === 'admin'
        ? null
        : new CopyPlugin({
            patterns: [
              {
                // copy the shared public assets into dist
                from: join(
                  workspaceRoot,
                  'packages',
                  'frontend',
                  'core',
                  'public'
                ),
                to: join(cwd, 'dist'),
              },
            ],
          }),
      buildFlags.mode === 'production' && process.env.R2_SECRET_ACCESS_KEY
        ? new WebpackS3Plugin()
        : null,
    ]),
    stats: {
      errorDetails: true,
    },

    optimization: OptimizeOptionOptions(buildFlags),

    devServer: {
      hot: buildFlags.static ? false : 'only',
      liveReload: !buildFlags.static,
      client: {
        overlay: process.env.DISABLE_DEV_OVERLAY === 'true' ? false : undefined,
      },
      historyApiFallback: true,
      static: [
        {
          directory: join(
            projectRoot,
            'packages',
            'frontend',
            'core',
            'public'
          ),
          publicPath: '/',
          watch: !buildFlags.static,
        },
        {
          directory: join(cwd, 'public'),
          publicPath: '/',
          watch: !buildFlags.static,
        },
      ],
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
      ],
    } as DevServerConfiguration,
  } satisfies webpack.Configuration;

  if (buildFlags.mode === 'production' && process.env.PERFSEE_TOKEN) {
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
