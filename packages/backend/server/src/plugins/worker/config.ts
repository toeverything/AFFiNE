import { defineModuleConfig } from '../../base';

export interface WorkerStartupConfigurations {
  allowedOrigin: string[];
}

declare global {
  interface AppConfigSchema {
    worker: {
      allowedOrigin: ConfigItem<string[]>;
    };
  }
}

defineModuleConfig('worker', {
  allowedOrigin: {
    desc: 'Allowed origin',
    default: ['localhost', '127.0.0.1'],
  },
});
