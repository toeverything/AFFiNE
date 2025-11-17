import z from 'zod';

import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    mailer: {
      SMTP: {
        name: string;
        host: string;
        port: number;
        username: string;
        password: string;
        ignoreTLS: boolean;
        sender: string;
      };

      fallbackDomains: ConfigItem<string[]>;
      fallbackSMTP: {
        name: string;
        host: string;
        port: number;
        username: string;
        password: string;
        ignoreTLS: boolean;
        sender: string;
      };
    };
  }
}

defineModuleConfig('mailer', {
  'SMTP.name': {
    desc: 'Name of the email server (e.g. your domain name)',
    default: 'AFFiNE Server',
    env: 'MAILER_SERVERNAME',
  },
  'SMTP.host': {
    desc: 'Host of the email server (e.g. smtp.gmail.com)',
    default: '',
    env: 'MAILER_HOST',
  },
  'SMTP.port': {
    desc: 'Port of the email server (they commonly are 25, 465 or 587)',
    default: 465,
    env: ['MAILER_PORT', 'integer'],
  },
  'SMTP.username': {
    desc: 'Username used to authenticate the email server',
    default: '',
    env: 'MAILER_USER',
  },
  'SMTP.password': {
    desc: 'Password used to authenticate the email server',
    default: '',
    env: 'MAILER_PASSWORD',
  },
  'SMTP.sender': {
    desc: 'Sender of all the emails (e.g. "AFFiNE Self Hosted \<noreply@example.com\>")',
    default: 'AFFiNE Self Hosted <noreply@example.com>',
    env: 'MAILER_SENDER',
  },
  'SMTP.ignoreTLS': {
    desc: "Whether ignore email server's TLS certificate verification. Enable it for self-signed certificates.",
    default: false,
    env: ['MAILER_IGNORE_TLS', 'boolean'],
  },

  fallbackDomains: {
    desc: 'The emails from these domains are always sent using the fallback SMTP server.',
    default: [],
    shape: z.array(z.string()),
  },
  'fallbackSMTP.name': {
    desc: 'Name of the fallback email server (e.g. your domain name)',
    default: 'AFFiNE Server',
  },
  'fallbackSMTP.host': {
    desc: 'Host of the email server (e.g. smtp.gmail.com)',
    default: '',
  },
  'fallbackSMTP.port': {
    desc: 'Port of the email server (they commonly are 25, 465 or 587)',
    default: 465,
  },
  'fallbackSMTP.username': {
    desc: 'Username used to authenticate the email server',
    default: '',
  },
  'fallbackSMTP.password': {
    desc: 'Password used to authenticate the email server',
    default: '',
  },
  'fallbackSMTP.sender': {
    desc: 'Sender of all the emails (e.g. "AFFiNE Self Hosted \<noreply@example.com\>")',
    default: '',
  },
  'fallbackSMTP.ignoreTLS': {
    desc: "Whether ignore email server's TLS certificate verification. Enable it for self-signed certificates.",
    default: false,
  },
});
