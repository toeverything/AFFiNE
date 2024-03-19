import { StorybookConfig } from '@storybook/react-vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { mergeConfig } from 'vite';
import { getRuntimeConfig } from '@affine/cli/src/webpack/runtime-config';

export default {
  stories: ['../src/ui/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-mdx-gfm',
    'storybook-dark-mode',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  features: {
    storyStoreV7: true,
  },
  docs: {
    autodocs: true,
  },
  async viteFinal(config, _options) {
    return mergeConfig(config, {
      plugins: [vanillaExtractPlugin()],
      define: {
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
} satisfies StorybookConfig;
