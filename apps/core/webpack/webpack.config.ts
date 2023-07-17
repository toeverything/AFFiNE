import { join } from 'node:path';

import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { merge } from 'webpack-merge';

import { watchGraphqlSchema,watchRoutes } from '../codegen';
import { exists,IN_CI, packages, rootPath } from '../utils';
import { productionCacheGroups } from './cache-group';
import { IgnoreNotFoundExportPlugin } from './ignore-not-found-plugin';
import svgoConfig from './svgo.config.json';

const isProduction = () => process.env.NODE_ENV === 'production';

const OptimizeOptionOptions: () => webpack.Configuration['optimization'] =
  () => ({
    minimize: isProduction(),
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
      cacheGroups: isProduction()
        ? productionCacheGroups
        : {
            default: false,
            vendors: false,
          },
    },
  });

const config: () => webpack.Configuration = () => {
  let publicPath =
    process.env.PUBLIC_PATH ?? (isProduction() ? '' : 'http://localhost:8080');
  publicPath = publicPath.endsWith('/') ? publicPath : `${publicPath}/`;

  return {
    context: rootPath,
    output: {
      path: join(rootPath, 'dist'),
      publicPath,
    },

    mode: isProduction() ? 'production' : 'development',

    devtool: isProduction()
      ? 'hidden-nosources-source-map'
      : 'eval-cheap-module-source-map',

    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.gql'],
      alias: packages.reduce(
        (alias, pkg) => {
          const index = pkg.relative('index.js');
          alias[pkg.name] = exists(index) ? index : pkg.srcPath;
          return alias;
        },
        {
          '@fluentui/theme': join(
            rootPath,
            'node_modules',
            '@fluentui',
            'theme'
          ),
          tslib: join(rootPath, 'node_modules', 'tslib', 'tslib.es6.js'),
        }
      ),
    },

    module: {
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
              use: [
                'thread-loader',
                {
                  loader: 'ts-loader',
                  options: {
                    transpileOnly: true,
                    happyPackMode: true,
                    configFile: join(process.cwd(), 'tsconfig.json'),
                    experimentalWatchApi: true,
                    getCustomTransformers: join(
                      process.cwd(),
                      'tools',
                      'webpack',
                      'ts-transformers'
                    ),
                    compilerOptions: {
                      jsx: isProduction() ? 'react-jsx' : 'react-jsxdev',
                    },
                  },
                },
              ],
              exclude: /node_modules/,
            },
            {
              test: /\.mdx?$/,
              use: [
                {
                  loader: '@mdx-js/loader',
                  options: {
                    providerImportSource: '@mdx-js/react',
                    remarkPlugins: [images, emoji],
                  },
                },
              ],
              exclude: /node_modules/,
            },
            {
              test: /\.svg$/,
              use: [
                'thread-loader',
                {
                  loader: '@svgr/webpack',
                  options: {
                    icon: true,
                    svgoConfig,
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
      new IgnoreNotFoundExportPlugin(),
    ],
    optimization: OptimizeOptionOptions(),
  };
};
