import { dirname, join } from 'path';
import { StorybookConfig } from '@storybook/react-vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import swc from 'unplugin-swc';
import { mergeConfig } from 'vite';
import { getBuildConfig } from '@affine/cli/src/webpack/runtime-config';

export default {
  stories: ['../src/ui/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],

  addons: [
    getAbsolutePath('@storybook/addon-links'),
    getAbsolutePath('@storybook/addon-essentials'),
    getAbsolutePath('@storybook/addon-interactions'),
    getAbsolutePath('@storybook/addon-mdx-gfm'),
    '@chromatic-com/storybook',
  ],

  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },

  features: {},

  docs: {},

  async viteFinal(config, _options) {
    return mergeConfig(config, {
      plugins: [
        vanillaExtractPlugin(),
        swc.vite({
          jsc: {
            preserveAllComments: true,
            parser: {
              syntax: 'typescript',
              dynamicImport: true,
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
        }),
      ],
      define: {
        'process.env.CAPTCHA_SITE_KEY': `"${process.env.CAPTCHA_SITE_KEY}"`,
        runtimeConfig: getBuildConfig({
          distribution: 'web',
          mode: 'development',
          channel: 'canary',
          static: false,
          coverage: false,
        }),
      },
    });
  },

  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
} satisfies StorybookConfig;

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')));
}
