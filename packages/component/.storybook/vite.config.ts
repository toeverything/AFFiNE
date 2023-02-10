import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: Pick<StorybookConfig, 'viteFinal'> = {
  async viteFinal(config, { configType }) {
    return mergeConfig(config, {});
  },
};

export default config;
