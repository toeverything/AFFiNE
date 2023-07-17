import { join } from 'node:path';
import { fileURLToPath } from 'node:url'

import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

import { productionCacheGroups } from './cache-group';

const IN_CI = !!process.env.CI

const rootPath = fileURLToPath(new URL('..', import.meta.url));

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
  '@toeverything/y-indexeddb'
]

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
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.gql']
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
              test: /\.svg$/,
              use: [
                'thread-loader',
                {
                  loader: '@svgr/webpack',
                  options: {
                    icon: true
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
    ],
    optimization: OptimizeOptionOptions(),
  };
};
