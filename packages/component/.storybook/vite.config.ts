import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'url';

const config: Pick<StorybookConfig, 'viteFinal'> = {
  async viteFinal(config, { configType }) {
    return mergeConfig(config, {
      resolve: {
        alias: {
          '@': path.resolve(fileURLToPath(new URL('../src', import.meta.url))),
          '@affine/i18n': path.resolve(
            fileURLToPath(new URL('../../i18n/src', import.meta.url))
          ),
        },
      },
    });
  },
};

export default config;
