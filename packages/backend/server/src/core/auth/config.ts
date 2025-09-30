import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export interface AuthConfig {
  session: {
    ttl: number;
    ttr: number;
  };
  allowSignup: boolean;
  allowSignupForOauth: boolean;
  requireEmailDomainVerification: boolean;
  requireEmailVerification: boolean;
  passwordRequirements: ConfigItem<{
    min: number;
    max: number;
  }>;
}

declare global {
  interface AppConfigSchema {
    auth: AuthConfig;
  }
}

defineModuleConfig('auth', {
  allowSignup: {
    desc: 'Whether allow new registrations.',
    default: true,
  },
  allowSignupForOauth: {
    desc: 'Whether allow new registrations via configured oauth.',
    default: true,
  },
  requireEmailDomainVerification: {
    desc: 'Whether require email domain record verification before accessing restricted resources.',
    default: false,
  },
  requireEmailVerification: {
    desc: 'Whether require email verification before accessing restricted resources(not implemented).',
    default: true,
  },
  passwordRequirements: {
    desc: 'The password strength requirements when set new password.',
    default: {
      min: 8,
      max: 32,
    },
    shape: z
      .object({
        min: z.number().min(1),
        max: z.number().max(100),
      })
      .strict()
      .refine(data => data.min < data.max, {
        message: 'Minimum length of password must be less than maximum length',
      }),
    schema: {
      type: 'object',
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
      },
    },
  },
  'session.ttl': {
    desc: 'Application auth expiration time in seconds.',
    default: 60 * 60 * 24 * 15, // 15 days
  },
  'session.ttr': {
    desc: 'Application auth time to refresh in seconds.',
    default: 60 * 60 * 24 * 7, // 7 days
  },
});
