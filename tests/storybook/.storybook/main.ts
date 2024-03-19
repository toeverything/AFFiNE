import { runCli } from '@magic-works/i18n-codegen';
import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { getRuntimeConfig } from '@affine/cli/src/webpack/runtime-config';

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
    'storybook-dark-mode',
    'storybook-addon-react-router-v6',
  ],
  framework: {
    name: '@storybook/react-vite',
  },
  async viteFinal(config, _options) {
    const runtimeConfig = getRuntimeConfig({
      distribution: 'browser',
      mode: 'development',
      channel: 'canary',
      coverage: false,
    });
    // disable for storybook build
    runtimeConfig.enableCloud = false;
    return mergeConfig(config, {
      assetsInclude: ['**/*.md'],
      resolve: {
        alias: {
          // workaround for https://github.com/vitejs/vite/issues/9731
          // it seems vite does not resolve self reference correctly?
          '@affine/core': fileURLToPath(
            new URL('../../../packages/frontend/core/src', import.meta.url)
          ),
        },
      },
      plugins: [vanillaExtractPlugin()],
      define: {
        'process.on': 'undefined',
        'process.env': {},
        'process.env.COVERAGE': JSON.stringify(!!process.env.COVERAGE),
        'process.env.SHOULD_REPORT_TRACE': `${Boolean(
          process.env.SHOULD_REPORT_TRACE === 'true'
        )}`,
        'process.env.TRACE_REPORT_ENDPOINT': `"${process.env.TRACE_REPORT_ENDPOINT}"`,
        'process.env.CAPTCHA_SITE_KEY': `"${process.env.CAPTCHA_SITE_KEY}"`,
        runtimeConfig: runtimeConfig,
      },
    });
  },
} as StorybookConfig;
