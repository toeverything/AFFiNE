import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../../../apps/web/public'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-storysource',
    '@storybook/addon-coverage',
    'storybook-dark-mode',
  ],
  framework: {
    name: '@storybook/react-vite',
  },
  async viteFinal(config, { configType }) {
    return mergeConfig(config, {
      plugins: [
        vanillaExtractPlugin(),
        tsconfigPaths({
          root: fileURLToPath(new URL('../../../', import.meta.url)),
        }),
      ],
      define: {
        'process.env': {},
      },
      resolve: {
        alias: {
          'dotenv/config': fileURLToPath(
            new URL('../../../scripts/vitest/dotenv-config.ts', import.meta.url)
          ),
          'next/config': fileURLToPath(
            new URL(
              '../../../scripts/vitest/next-config-mock.ts',
              import.meta.url
            )
          ),
        },
      },
    });
  },
} as StorybookConfig;
