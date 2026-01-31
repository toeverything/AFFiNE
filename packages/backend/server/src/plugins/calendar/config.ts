import { z } from 'zod';

import { defineModuleConfig, JSONSchema } from '../../base';

export interface CalendarGoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  externalWebhookUrl?: string;
  webhookVerificationToken?: string;
}

declare global {
  interface AppConfigSchema {
    calendar: {
      google: ConfigItem<CalendarGoogleConfig>;
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
});
