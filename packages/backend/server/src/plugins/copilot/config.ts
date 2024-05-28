import type { ClientOptions as OpenAIClientOptions } from 'openai';

import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';
import { StorageConfig } from '../../fundamentals/storage/config';
import type { FalConfig } from './providers/fal';

export interface CopilotStartupConfigurations {
  openai?: OpenAIClientOptions;
  fal?: FalConfig;
  test?: never;
  unsplashKey?: string;
  storage: StorageConfig;
}

declare module '../config' {
  interface PluginsConfig {
    copilot: ModuleConfig<CopilotStartupConfigurations>;
  }
}

defineStartupConfig('plugins.copilot', {
  storage: {
    provider: 'fs',
    bucket: 'copilot',
  },
});
