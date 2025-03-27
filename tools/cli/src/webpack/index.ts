import { createRequire } from 'node:module';

import { getBuildConfig } from '@affine-tools/utils/build-config';
import { ProjectRoot } from '@affine-tools/utils/path';
import type { Package } from '@affine-tools/utils/workspace';
import { PerfseePlugin } from '@perfsee/webpack';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import compact from 'lodash-es/compact';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

import { productionCacheGroups } from './cache-group.js';
import {
  createBackgroundWorkerHTMLPlugin,
  createHTMLPlugins,
  createPopupHTMLPlugin,
  createShellHTMLPlugin,
} from './html-plugin.js';
import { WebpackS3Plugin } from './s3-plugin.js';
import type { BuildFlags } from './types';

const require = createRequire(import.meta.url);
const cssnano = require('cssnano');

const IN_CI = !!process.env.CI;

const OptimizeOptionOptions: (
  flags: BuildFlags
) => webpack.Configuration['optimization'] = flags => ({
  minimize: flags.mode === 'production',
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
        mangle: {
          keep_classnames: true,
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
    cacheGroups: productionCacheGroups,
  },
});

export function createWebpackConfig(
  pkg: Package,
  flags: BuildFlags
): webpack.Configuration {
  const buildConfig = getBuildConfig(pkg, flags);

  const config = {
    name: 'affine',
    context: pkg.path.value,
    experiments: {
      topLevelAwait: true,
      outputModule: false,
      syncWebAssembly: true,
    },
    entry: {
      app: pkg.entry ?? './src/index.tsx',
    },
    output: {
      environment: {
        module: true,
        dynamicImport: true,
      },
      filename:
        flags.mode === 'production'
          ? 'js/[name].[contenthash:8].js'
          : 'js/[name].js',
      // In some cases webpack will emit files starts with "_" which is reserved in web extension.
      chunkFilename: pathData =>
        pathData.chunk?.name?.endsWith?.('worker')
          ? 'js/[name].[contenthash:8].js'
          : flags.mode === 'production'
            ? 'js/chunk.[name].[contenthash:8].js'
            : 'js/chunk.[name].js',
      assetModuleFilename:
        flags.mode === 'production'
          ? 'assets/[name].[contenthash:8][ext][query]'
          : '[name].[contenthash:8][ext]',
      devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]',
      hotUpdateChunkFilename: 'hot/[id].[fullhash].js',
      hotUpdateMainFilename: 'hot/[runtime].[fullhash].json',
      path: pkg.distPath.value,
      clean: flags.mode === 'production',
      globalObject: 'globalThis',
      // NOTE(@forehalo): always keep it '/'
      publicPath: '/',
      workerPublicPath: '/',
    },
    target: ['web', 'es2022'],

    mode: flags.mode,

    devtool:
      flags.mode === 'production' ? 'source-map' : 'cheap-module-source-map',

    resolve: {
      symlinks: true,
      extensionAlias: {
        '.js': ['.js', '.tsx', '.ts'],
        '.mjs': ['.mjs', '.mts'],
      },
      extensions: ['.js', '.ts', '.tsx'],
      alias: {
        yjs: ProjectRoot.join('node_modules', 'yjs').value,
        lit: ProjectRoot.join('node_modules', 'lit').value,
        '@preact/signals-core': ProjectRoot.join(
          'node_modules',
          '@preact',
          'signals-core'
        ).value,
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
                flags.mode === 'development'
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
                      plugins: pkg.join('tailwind.config.js').exists()
                        ? [
                            [
                              '@tailwindcss/postcss',
                              require(pkg.join('tailwind.config.js').value),
                            ],
                            ['autoprefixer'],
                          ]
                        : [
                            cssnano({
                              preset: [
                                'default',
                                {
                                  convertValues: false,
                                },
                              ],
                            }),
                          ],
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
      flags.mode === 'development'
        ? null
        : // todo: support multiple entry points
          new MiniCssExtractPlugin({
            filename: `[name].[contenthash:8].css`,
            ignoreOrder: true,
          }),
      new VanillaExtractPlugin(),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(flags.mode),
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
      buildConfig.isAdmin
        ? null
        : new CopyPlugin({
            patterns: [
              {
                // copy the shared public assets into dist
                from: pkg.workspace.getPackage('@affine/core').join('public')
                  .value,
              },
            ],
          }),
      flags.mode === 'production' &&
      (buildConfig.isWeb || buildConfig.isMobileWeb || buildConfig.isAdmin) &&
      process.env.R2_SECRET_ACCESS_KEY
        ? new WebpackS3Plugin()
        : null,
    ]),
    stats: {
      errorDetails: true,
    },
    optimization: OptimizeOptionOptions(flags),
    devServer: {
      host: '0.0.0.0',
      allowedHosts: 'all',
      hot: false,
      liveReload: true,
      client: {
        overlay: process.env.DISABLE_DEV_OVERLAY === 'true' ? false : undefined,
      },
      historyApiFallback: {
        rewrites: [
          {
            from: /.*/,
            to: () => {
              return process.env.SELF_HOSTED === 'true'
                ? '/selfhost.html'
                : '/index.html';
            },
          },
        ],
      },
      static: [
        {
          directory: pkg.workspace.getPackage('@affine/core').join('public')
            .value,
          publicPath: '/',
          watch: true,
        },
      ],
      proxy: [
        { context: '/api', target: 'http://localhost:3010' },
        { context: '/socket.io', target: 'http://localhost:3010', ws: true },
        { context: '/graphql', target: 'http://localhost:3010' },
      ],
    } as DevServerConfiguration,
  } satisfies webpack.Configuration;

  if (flags.mode === 'production' && process.env.PERFSEE_TOKEN) {
    config.plugins.push(
      new PerfseePlugin({
        project: 'affine-toeverything',
      })
    );
  }

  if (flags.mode === 'development') {
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

  config.plugins = config.plugins.concat(createHTMLPlugins(flags, buildConfig));

  if (buildConfig.isElectron) {
    config.plugins.push(createShellHTMLPlugin(flags, buildConfig));
    config.plugins.push(createBackgroundWorkerHTMLPlugin(flags, buildConfig));
    config.plugins.push(createPopupHTMLPlugin(flags, buildConfig));

    // sourcemap url like # sourceMappingURL=76-6370cd185962bc89.js.map wont load in electron
    // this is because the default file:// protocol will be ignored by Chromium
    // so we need to replace the sourceMappingURL to assets:// protocol
    // for example:
    // replace # sourceMappingURL=76-6370cd185962bc89.js.map
    // to      # sourceMappingURL=assets://./{dir}/76-6370cd185962bc89.js.map
    config.plugins.push(
      new webpack.SourceMapDevToolPlugin({
        append: pathData => {
          return `\n//# sourceMappingURL=assets://./${pathData.filename}.map`;
        },
        filename: '[file].map',
      })
    );
  }

  return config;
}
