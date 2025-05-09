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
      },
      challenge: {
        bits: 20,
      },
    },
  },
});
