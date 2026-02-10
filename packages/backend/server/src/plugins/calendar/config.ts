import { z } from 'zod';

import { defineModuleConfig, JSONSchema } from '../../base';

export interface CalendarGoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  externalWebhookUrl?: string;
  webhookVerificationToken?: string;
}

export type CalendarCalDAVAuthType = 'auto' | 'basic' | 'digest';

export interface CalendarCalDAVProviderPreset {
  id: string;
  label: string;
  serverUrl: string;
  authType?: CalendarCalDAVAuthType;
  requiresAppPassword?: boolean;
  docsUrl?: string;
}

export interface CalendarCalDAVConfig {
  enabled: boolean;
  allowCustomProvider?: boolean;
  providers: CalendarCalDAVProviderPreset[];
  allowInsecureHttp?: boolean;
  allowedHosts?: string[];
  blockPrivateNetwork?: boolean;
  requestTimeoutMs?: number;
  maxRedirects?: number;
}

declare global {
  interface AppConfigSchema {
    calendar: {
      google: ConfigItem<CalendarGoogleConfig>;
      caldav: ConfigItem<CalendarCalDAVConfig>;
    };
  }
}

const schema: JSONSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    clientId: { type: 'string' },
    clientSecret: { type: 'string' },
    externalWebhookUrl: { type: 'string' },
    webhookVerificationToken: { type: 'string' },
  },
};

const caldavSchema: JSONSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    allowCustomProvider: { type: 'boolean' },
    providers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          serverUrl: { type: 'string' },
          authType: { type: 'string' },
          requiresAppPassword: { type: 'boolean' },
          docsUrl: { type: 'string' },
        },
      },
    },
    allowInsecureHttp: { type: 'boolean' },
    allowedHosts: { type: 'array', items: { type: 'string' } },
    blockPrivateNetwork: { type: 'boolean' },
    requestTimeoutMs: { type: 'number' },
    maxRedirects: { type: 'number' },
  },
};

defineModuleConfig('calendar', {
  google: {
    desc: 'Google Calendar integration config',
    default: {
      enabled: false,
      clientId: '',
      clientSecret: '',
      externalWebhookUrl: '',
      webhookVerificationToken: '',
    },
    schema,
    shape: z.object({
      enabled: z.boolean(),
      clientId: z.string(),
      clientSecret: z.string(),
      externalWebhookUrl: z
        .string()
        .url()
        .regex(/^https:\/\//, 'externalWebhookUrl must be https')
        .or(z.string().length(0))
        .optional(),
      webhookVerificationToken: z.string().optional(),
    }),
    link: 'https://developers.google.com/calendar/api/guides/push',
  },
  caldav: {
    desc: 'CalDAV integration config',
    default: {
      enabled: false,
      allowCustomProvider: false,
      providers: [],
      allowInsecureHttp: false,
      allowedHosts: [],
      blockPrivateNetwork: true,
      requestTimeoutMs: 10_000,
      maxRedirects: 5,
    },
    schema: caldavSchema,
    shape: z.object({
      enabled: z.boolean(),
      allowCustomProvider: z.boolean().optional(),
      providers: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          serverUrl: z.string().url(),
          authType: z.enum(['auto', 'basic', 'digest']).optional(),
          requiresAppPassword: z.boolean().optional(),
          docsUrl: z.string().url().optional(),
        })
      ),
      allowInsecureHttp: z.boolean().optional(),
      allowedHosts: z.array(z.string()).optional(),
      blockPrivateNetwork: z.boolean().optional(),
      requestTimeoutMs: z.number().int().positive().optional(),
      maxRedirects: z.number().int().nonnegative().optional(),
    }),
  },
});
