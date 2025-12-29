import { createRequire } from 'node:module';
import path from 'node:path';

import { getBuildConfig } from '@affine-tools/utils/build-config';
import { Path, ProjectRoot } from '@affine-tools/utils/path';
import { Package } from '@affine-tools/utils/workspace';
import { PerfseePlugin } from '@perfsee/webpack';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import { compact, merge } from 'lodash-es';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

import { productionCacheGroups } from './cache-group.js';
import {
  type CreateHTMLPluginConfig,
  createHTMLPlugins,
} from './html-plugin.js';
import { WebpackS3Plugin } from './s3-plugin.js';

const require = createRequire(import.meta.url);
const cssnano = require('cssnano');

const IN_CI = !!process.env.CI;

const availableChannels = ['canary', 'beta', 'stable', 'internal'];
function getBuildConfigFromEnv(pkg: Package) {
  const channel = process.env.BUILD_TYPE ?? 'canary';
  const dev = process.env.NODE_ENV === 'development';
  if (!availableChannels.includes(channel)) {
    throw new Error(
      `BUILD_TYPE must be one of ${availableChannels.join(', ')}, received [${channel}]`
    );
  }

  return getBuildConfig(pkg, {
    // @ts-expect-error checked
    channel,
    mode: dev ? 'development' : 'production',
  });
}

export function createHTMLTargetConfig(
  pkg: Package,
  entry: string | Record<string, string>,
  htmlConfig: Partial<CreateHTMLPluginConfig> = {},
  deps?: string[]
): webpack.Configuration {
  entry = typeof entry === 'string' ? { index: entry } : entry;

  htmlConfig = merge(
    {},
    {
      filename: 'index.html',
      additionalEntryForSelfhost: true,
      injectGlobalErrorHandler: true,
      emitAssetsManifest: true,
    },
    htmlConfig
  );

  const buildConfig = getBuildConfigFromEnv(pkg);

  console.log(
    `Building [${pkg.name}] for [${buildConfig.appBuildType}] channel in [${buildConfig.debug ? 'development' : 'production'}] mode.`
  );
  console.log(
    `Entry points: ${Object.entries(entry)
      .map(([name, path]) => `${name}: ${path}`)
      .join(', ')}`
  );
  console.log(`Output path: ${pkg.distPath.value}`);
  console.log(`Config: ${JSON.stringify(buildConfig, null, 2)}`);

  const config: webpack.Configuration = {
    //#region basic webpack config
    name: entry['index'],
    dependencies: deps,
    context: ProjectRoot.value,
    experiments: {
      topLevelAwait: true,
      outputModule: false,
      syncWebAssembly: true,
    },
    entry,
    output: {
      environment: { module: true, dynamicImport: true },
      filename: buildConfig.debug
        ? 'js/[name].js'
        : 'js/[name].[contenthash:8].js',
      assetModuleFilename: buildConfig.debug
        ? '[name].[contenthash:8][ext]'
        : 'assets/[name].[contenthash:8][ext][query]',
      path: pkg.distPath.value,
      clean: false,
      globalObject: 'globalThis',
      // NOTE(@forehalo): always keep it '/'
      publicPath: '/',
    },
    target: ['web', 'es2022'],
    mode: buildConfig.debug ? 'development' : 'production',
    devtool: buildConfig.debug ? 'cheap-module-source-map' : 'source-map',
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
    //#endregion

    //#region module config
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
      //#region rules
      rules: [
        { test: /\.m?js?$/, resolve: { fullySpecified: false } },
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
                    react: { runtime: 'automatic' },
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
            { test: /\.(ttf|eot|woff|woff2)$/, type: 'asset/resource' },
            { test: /\.txt$/, type: 'asset/source' },
            { test: /\.inline\.svg$/, type: 'asset/inline' },
            {
              test: /\.css$/,
              use: [
                buildConfig.debug
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
                              preset: ['default', { convertValues: false }],
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
      //#endregion
    },
    //#endregion

    //#region plugins
    plugins: compact([
      !IN_CI && new webpack.ProgressPlugin({ percentBy: 'entries' }),
      ...createHTMLPlugins(buildConfig, htmlConfig),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        ...Object.entries(buildConfig).reduce(
          (def, [k, v]) => {
            def[`BUILD_CONFIG.${k}`] = JSON.stringify(v);
            return def;
          },
          {} as Record<string, string>
        ),
      }),
      !buildConfig.debug &&
        // todo: support multiple entry points
        new MiniCssExtractPlugin({
          filename: `[name].[contenthash:8].css`,
          ignoreOrder: true,
        }),
      new VanillaExtractPlugin(),
      !buildConfig.isAdmin &&
        new CopyPlugin({
          patterns: [
            {
              // copy the shared public assets into dist
              from: new Package('@affine/core').join('public').value,
            },
          ],
        }),
      !buildConfig.debug &&
        (buildConfig.isWeb || buildConfig.isMobileWeb || buildConfig.isAdmin) &&
        process.env.R2_SECRET_ACCESS_KEY &&
        new WebpackS3Plugin(),
      !buildConfig.debug &&
        process.env.PERFSEE_TOKEN &&
        new PerfseePlugin({ project: 'affine-toeverything' }),
      process.env.SENTRY_AUTH_TOKEN &&
        process.env.SENTRY_ORG &&
        process.env.SENTRY_PROJECT &&
        sentryWebpackPlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
      // sourcemap url like # sourceMappingURL=76-6370cd185962bc89.js.map wont load in electron
      // this is because the default file:// protocol will be ignored by Chromium
      // so we need to replace the sourceMappingURL to assets:// protocol
      // for example:
      // replace # sourceMappingURL=76-6370cd185962bc89.js.map
      // to      # sourceMappingURL=assets://./{dir}/76-6370cd185962bc89.js.map
      buildConfig.isElectron &&
        new webpack.SourceMapDevToolPlugin({
          append: pathData => {
            return `\n//# sourceMappingURL=assets://./${pathData.filename}.map`;
          },
          filename: '[file].map',
        }),
    ]),
    //#endregion

    stats: { errorDetails: true },

    //#region optimization
    optimization: {
      minimize: !buildConfig.debug,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
          parallel: true,
          extractComments: true,
          terserOptions: {
            ecma: 2020,
            compress: { unused: true },
            mangle: { keep_classnames: true },
          },
        }),
      ],
      removeEmptyChunks: true,
      providedExports: true,
      usedExports: true,
      sideEffects: true,
      removeAvailableModules: true,
      runtimeChunk: { name: 'runtime' },
      splitChunks: {
        chunks: 'all',
        minSize: 1,
        minChunks: 1,
        maxInitialRequests: Number.MAX_SAFE_INTEGER,
        maxAsyncRequests: Number.MAX_SAFE_INTEGER,
        cacheGroups: productionCacheGroups,
      },
    },
    //#endregion
  };

  if (buildConfig.debug && !IN_CI) {
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
          default: { minChunks: 2, priority: -20, reuseExistingChunk: true },
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

  return config;
}

export function createWorkerTargetConfig(
  pkg: Package,
  entry: string
): Omit<webpack.Configuration, 'name'> & { name: string } {
  const workerName = path.basename(entry).replace(/\.worker\.ts$/, '');
  const buildConfig = getBuildConfigFromEnv(pkg);

  return {
    name: entry,
    context: ProjectRoot.value,
    experiments: {
      topLevelAwait: true,
      outputModule: false,
      syncWebAssembly: true,
    },
    entry: { [workerName]: entry },
    output: {
      filename: `js/${workerName}-${buildConfig.appVersion}.worker.js`,
      path: pkg.distPath.value,
      clean: false,
      globalObject: 'globalThis',
      // NOTE(@forehalo): always keep it '/'
      publicPath: '/',
    },
    target: ['webworker', 'es2022'],
    mode: buildConfig.debug ? 'development' : 'production',
    devtool: buildConfig.debug ? 'cheap-module-source-map' : 'source-map',
    resolve: {
      symlinks: true,
      extensionAlias: { '.js': ['.js', '.ts'], '.mjs': ['.mjs', '.mts'] },
      extensions: ['.js', '.ts'],
      alias: { yjs: ProjectRoot.join('node_modules', 'yjs').value },
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
        { test: /\.m?js?$/, resolve: { fullySpecified: false } },
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
          ],
        },
      ],
    },
    plugins: compact([
      new webpack.DefinePlugin(
        Object.entries(buildConfig).reduce(
          (def, [k, v]) => {
            def[`BUILD_CONFIG.${k}`] = JSON.stringify(v);
            return def;
          },
          {} as Record<string, string>
        )
      ),
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      process.env.SENTRY_AUTH_TOKEN &&
        process.env.SENTRY_ORG &&
        process.env.SENTRY_PROJECT &&
        sentryWebpackPlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
    ]),
    stats: { errorDetails: true },
    optimization: {
      minimize: !buildConfig.debug,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
          parallel: true,
          extractComments: true,
          terserOptions: {
            ecma: 2020,
            compress: { unused: true },
            mangle: { keep_classnames: true },
          },
        }),
      ],
      removeEmptyChunks: true,
      providedExports: true,
      usedExports: true,
      sideEffects: true,
      removeAvailableModules: true,
      runtimeChunk: false,
      splitChunks: false,
    },
    performance: { hints: false },
  };
}

export function createNodeTargetConfig(
  pkg: Package,
  entry: string
): Omit<webpack.Configuration, 'name'> & { name: string } {
  const dev = process.env.NODE_ENV === 'development';
  return {
    name: entry,
    context: ProjectRoot.value,
    experiments: {
      topLevelAwait: true,
      outputModule: pkg.packageJson.type === 'module',
      syncWebAssembly: true,
    },
    entry: { index: entry },
    output: {
      filename: `main.js`,
      path: pkg.distPath.value,
      clean: true,
      globalObject: 'globalThis',
    },
    target: ['node', 'es2022'],
    externals: (data, callback) => {
      if (
        data.request &&
        // import ... from 'module'
        /^[a-zA-Z@]/.test(data.request) &&
        // not workspace deps
        !pkg.deps.some(dep => data.request!.startsWith(dep.name))
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    externalsPresets: { node: true },
    node: { __dirname: false, __filename: false },
    mode: dev ? 'development' : 'production',
    devtool: 'source-map',
    resolve: {
      symlinks: true,
      extensionAlias: { '.js': ['.js', '.ts'], '.mjs': ['.mjs', '.mts'] },
      extensions: ['.js', '.ts', '.tsx', '.node'],
      alias: { yjs: ProjectRoot.join('node_modules', 'yjs').value },
    },
    module: {
      parser: {
        javascript: { url: false, importMeta: false, createRequire: false },
      },
      rules: [
        {
          test: /\.js$/,
          enforce: 'pre',
          include: /@blocksuite/,
          use: ['source-map-loader'],
        },
        {
          test: /\.node$/,
          loader: Path.dir(import.meta.url).join('node-loader.js').value,
        },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: 'swc-loader',
          options: {
            // https://swc.rs/docs/configuring-swc/
            jsc: {
              preserveAllComments: true,
              parser: {
                syntax: 'typescript',
                dynamicImport: true,
                topLevelAwait: true,
                tsx: true,
                decorators: true,
              },
              target: 'es2022',
              externalHelpers: false,
              transform: {
                legacyDecorator: true,
                decoratorMetadata: true,
                react: { runtime: 'automatic' },
              },
            },
            sourceMaps: true,
            inlineSourcesContent: true,
          },
        },
      ],
    },
    plugins: compact([
      new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      new webpack.IgnorePlugin({
        checkResource(resource) {
          const lazyImports = [
            '@nestjs/microservices',
            '@nestjs/websockets/socket-module',
            '@apollo/subgraph',
            '@apollo/gateway',
            '@as-integrations/fastify',
            'ts-morph',
            'class-validator',
            'class-transformer',
          ];
          return lazyImports.some(lazyImport =>
            resource.startsWith(lazyImport)
          );
        },
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"',
      }),
    ]),
    stats: { errorDetails: true },
    optimization: {
      nodeEnv: false,
      minimize: !dev,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
          parallel: true,
          extractComments: true,
          terserOptions: {
            ecma: 2020,
            compress: { unused: true },
            mangle: { keep_classnames: true },
          },
        }),
      ],
    },
    performance: { hints: false },
    ignoreWarnings: [/^(?!CriticalDependenciesWarning$)/],
  };
}
