import { z } from 'zod';

import { defineModuleConfig } from '../../base';

export interface AuthConfig {
  session: {
    ttl: number;
    ttr: number;
  };
  token: {
    accessTokenTtl: number;
    refreshIdleTtl: number;
    refreshAbsoluteTtl: number;
    refreshGracePeriod: number;
    refreshRetention: number;
  };
  allowSignup: boolean;
  allowSignupForOauth: boolean;
  requireEmailDomainVerification: boolean;
  requireEmailVerification: boolean;
  newAccountActionDelay: number;
  trustedCloudflareHeaders: boolean;
  signInRateLimit: ConfigItem<{
    ttl: number;
    ipLimit: number;
    emailLimit: number;
  }>;
  inviteQuotaShadowMode: boolean;
  inviteQuotaFailOpenOnRuntimeError: boolean;
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
  newAccountActionDelay: {
    desc: 'Minimum account age in seconds before new accounts can invite members, create invite links, or publish documents. Set to 0 to disable.',
    default: 24 * 60 * 60,
    shape: z.number().int().min(0),
  },
  trustedCloudflareHeaders: {
    desc: 'Whether request abuse source facts should trust Cloudflare headers from the origin edge.',
    default: false,
    shape: z.boolean(),
  },
  signInRateLimit: {
    desc: 'Limits for sign-in attempts shared through Redis by source IP and email. ttl is measured in milliseconds.',
    default: {
      ttl: 60_000,
      ipLimit: 20,
      emailLimit: 5,
    },
    shape: z
      .object({
        ttl: z.number().int().positive(),
        ipLimit: z.number().int().positive(),
        emailLimit: z.number().int().positive(),
      })
      .strict(),
  },
  inviteQuotaShadowMode: {
    desc: 'Whether workspace invite quota should record would-block decisions without rejecting requests or executing abuse actions.',
    default: false,
    shape: z.boolean(),
  },
  inviteQuotaFailOpenOnRuntimeError: {
    desc: 'Whether workspace invite quota should fail open when native runtime admission is unavailable. Keep disabled for production.',
    default: false,
    shape: z.boolean(),
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
  'token.accessTokenTtl': {
    desc: 'Access JWT expiration time in seconds.',
    default: 15 * 60,
    shape: z
      .number()
      .int()
      .min(60)
      .max(60 * 60),
  },
  'token.refreshIdleTtl': {
    desc: 'Auth refresh session inactivity expiration in seconds.',
    default: 60 * 60 * 24 * 30,
    shape: z
      .number()
      .int()
      .min(60 * 60)
      .max(60 * 60 * 24 * 365),
  },
  'token.refreshAbsoluteTtl': {
    desc: 'Auth refresh session absolute expiration in seconds.',
    default: 60 * 60 * 24 * 180,
    shape: z
      .number()
      .int()
      .min(60 * 60)
      .max(60 * 60 * 24 * 730),
  },
  'token.refreshGracePeriod': {
    desc: 'One-use refresh rotation concurrency grace period in seconds.',
    default: 30,
    shape: z.number().int().min(0).max(60),
  },
  'token.refreshRetention': {
    desc: 'Retention for expired auth refresh generations in seconds.',
    default: 60 * 60 * 24 * 30,
    shape: z
      .number()
      .int()
      .min(60 * 60)
      .max(60 * 60 * 24 * 365),
  },
});
