import { FactoryProvider } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { Config } from '../../../config';

export const MAILER_SERVICE = Symbol('MAILER_SERVICE');

export type MailerService = Transporter<SMTPTransport.SentMessageInfo>;
export type Response = SMTPTransport.SentMessageInfo;
export type Options = SMTPTransport.Options;

export const MAILER: FactoryProvider<
  Transporter<SMTPTransport.SentMessageInfo>
> = {
  provide: MAILER_SERVICE,
  useFactory: (config: Config) => {
    if (config.auth.localEmail) {
      return createTransport({
        host: '0.0.0.0',
        port: 1025,
        secure: false,
        auth: {
          user: config.auth.email.login,
          pass: config.auth.email.password,
        },
      });
    }
    return createTransport({
      service: 'gmail',
      auth: {
        user: config.auth.email.login,
        pass: config.auth.email.password,
      },
    });
  },
  inject: [Config],
};
