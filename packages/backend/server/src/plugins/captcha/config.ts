import { z } from 'zod';

import { defineModuleConfig } from '../../base';
import { CaptchaConfig } from './types';

declare global {
  interface AppConfigSchema {
    captcha: {
      enabled: boolean;
      config: ConfigItem<CaptchaConfig>;
    };
  }
}

declare module '../../base/guard' {
  interface RegisterGuardName {
    captcha: 'captcha';
  }
}

defineModuleConfig('captcha', {
  enabled: {
    desc: 'Check captcha challenge when user authenticating the app.',
    default: false,
  },
  config: {
    desc: 'The config for the captcha plugin.',
    default: {
      turnstile: {
        secret: '',
        siteKey: '',
        action: 'auth-sign-in',
      },
      challenge: {
        bits: 20,
      },
    },
    shape: z
      .object({
        turnstile: z
          .object({
            secret: z.string().max(4096),
            siteKey: z.string().max(256),
            action: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
          })
          .strict(),
        challenge: z
          .object({ bits: z.number().int().min(16).max(30) })
          .strict(),
      })
      .strict(),
  },
});
