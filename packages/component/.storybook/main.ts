import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../../../apps/web/public'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-storysource',
    'storybook-dark-mode',
  ],
  framework: {
    name: '@storybook/react-vite',
  },
  async viteFinal(config, { configType }) {
    return mergeConfig(config, {
      plugins: [
        tsconfigPaths({
          root: fileURLToPath(new URL('../../../', import.meta.url)),
        }),
      ],
      define: {
        'process.env': {},
      },
      resolve: {
        alias: {
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
