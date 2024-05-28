import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { defineStartupConfig, ModuleConfig } from '../config';

declare module '../config' {
  interface AppConfig {
    /**
     * Configurations for mail service used to post auth or bussiness mails.
     *
     * @see https://nodemailer.com/smtp/
     */
    mailer: ModuleConfig<SMTPTransport.Options>;
  }
}

defineStartupConfig('mailer', {});
