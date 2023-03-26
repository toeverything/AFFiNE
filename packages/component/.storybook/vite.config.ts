import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'url';
import istanbul from 'vite-plugin-istanbul';

const config: Pick<StorybookConfig, 'viteFinal'> = {
  async viteFinal(config, { configType }) {
    return mergeConfig(config, {
      plugins: [
        istanbul({
          include: ['src/*'],
          exclude: ['node_modules', 'test', 'stories'],
          extension: ['.ts', '.tsx'],
          forceBuildInstrument: process.env.COVERAGE === 'true',
        }),
      ],
      resolve: {
        alias: {
          '@': resolve(fileURLToPath(new URL('../src', import.meta.url))),
          '@affine/i18n': resolve(
            fileURLToPath(new URL('../../i18n/src', import.meta.url))
          ),
        },
      },
    });
  },
};

export default config;
