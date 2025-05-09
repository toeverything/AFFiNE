import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    mailer: {
      SMTP: {
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
    desc: 'Sender of all the emails (e.g. "AFFiNE Team <noreply@affine.pro>")',
    default: '',
    env: 'MAILER_SENDER',
  },
  'SMTP.ignoreTLS': {
    desc: "Whether ignore email server's TSL certification verification. Enable it for self-signed certificates.",
    default: false,
    env: ['MAILER_IGNORE_TLS', 'boolean'],
  },
});
