import { defineModuleConfig } from '../config';

export type ThrottlerType = 'default' | 'strict';

declare global {
  interface AppConfigSchema {
    throttle: {
      enabled: boolean;
      throttlers: {
        [key in ThrottlerType]: ConfigItem<{
          ttl: number;
          limit: number;
        }>;
      };
    };
  }
}

defineModuleConfig('throttle', {
  enabled: {
    desc: 'Whether the throttler is enabled.',
    default: true,
  },
  'throttlers.default': {
    desc: 'The config for the default throttler.',
    default: {
      ttl: 60,
      limit: 120,
    },
  },
  'throttlers.strict': {
    desc: 'The config for the strict throttler.',
    default: {
      ttl: 60,
      limit: 20,
    },
  },
});
