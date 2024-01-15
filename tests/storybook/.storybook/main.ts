import { runCli } from '@magic-works/i18n-codegen';
import type { StorybookConfig } from '@storybook/react-webpack5';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { VanillaExtractPlugin } from '@vanilla-extract/webpack-plugin';
import { getRuntimeConfig } from '../../../packages/frontend/core/.webpack/runtime-config';

runCli(
  {
    config: fileURLToPath(
      new URL('../../../.i18n-codegen.json', import.meta.url)
    ),
    watch: false,
  },
  error => {
    console.error(error);
    process.exit(1);
  }
);

export default {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../../../packages/frontend/core/public'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-storysource',
    'storybook-dark-mode',
    'storybook-addon-react-router-v6',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {
      builder: {
        useSWC: true,
      },
    },
  },
  webpackFinal: async config => {
    const runtimeConfig = getRuntimeConfig({
      distribution: 'browser',
      mode: 'development',
      channel: 'canary',
      coverage: false,
    });
    // disable for storybook build
    runtimeConfig.enableCloud = false;
    return {
      ...config,
      resolve: {
        ...config.resolve,
        // some package use '.js' to import '.ts' files for compatibility with moduleResolution: node
        extensionAlias: {
          '.js': ['.js', '.tsx', '.ts'],
          '.mjs': ['.mjs', '.mts'],
        },
      },
      plugins: [
        new VanillaExtractPlugin(),
        new webpack.DefinePlugin({
          'process.env': JSON.stringify({}),
          'process.env.COVERAGE': JSON.stringify(!!process.env.COVERAGE),
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
        ...(config.plugins ?? []),
      ],
    };
  },
  swc: async config => {
    return {
      ...config,
      jsc: {
        // https://swc.rs/docs/configuring-swc/
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
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    };
  },
} as StorybookConfig;
