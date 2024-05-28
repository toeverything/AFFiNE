import { defineStartupConfig, ModuleConfig } from '../config';

export type ThrottlerType = 'default' | 'strict';

type ThrottlerStartupConfigurations = {
  [key in ThrottlerType]: {
    ttl: number;
    limit: number;
  };
};

declare module '../config' {
  interface AppConfig {
    throttler: ModuleConfig<ThrottlerStartupConfigurations>;
  }
}

defineStartupConfig('throttler', {
  default: {
    ttl: 60,
    limit: 120,
  },
  strict: {
    ttl: 60,
    limit: 20,
  },
});
