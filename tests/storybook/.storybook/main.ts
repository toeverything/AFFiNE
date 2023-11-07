import { runCli } from '@magic-works/i18n-codegen';
import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
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
    name: '@storybook/react-vite',
  },
  async viteFinal(config, _options) {
    return mergeConfig(config, {
      assetsInclude: ['**/*.md'],
      resolve: {
        alias: {
          '@toeverything/infra': fileURLToPath(
            new URL('../../../packages/common/infra/src', import.meta.url)
          ),
        },
      },
      plugins: [
        vanillaExtractPlugin(),
        tsconfigPaths({
          root: fileURLToPath(new URL('../../../', import.meta.url)),
          ignoreConfigErrors: true,
        }),
      ],
      define: {
        'process.on': '(() => void 0)',
        'process.env': {},
        'process.env.COVERAGE': JSON.stringify(!!process.env.COVERAGE),
        'process.env.SHOULD_REPORT_TRACE': `${Boolean(
          process.env.SHOULD_REPORT_TRACE === 'true'
        )}`,
        'process.env.TRACE_REPORT_ENDPOINT': `"${process.env.TRACE_REPORT_ENDPOINT}"`,
        'process.env.CAPTCHA_SITE_KEY': `"${process.env.CAPTCHA_SITE_KEY}"`,
        runtimeConfig: getRuntimeConfig({
          distribution: 'browser',
          mode: 'development',
          channel: 'canary',
          coverage: false,
        }),
      },
    });
  },
} as StorybookConfig;
