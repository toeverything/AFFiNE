import { FactoryProvider } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { Config } from '../config';

export const MAILER_SERVICE = Symbol('MAILER_SERVICE');

export type MailerService = Transporter<SMTPTransport.SentMessageInfo>;
export type Response = SMTPTransport.SentMessageInfo;
export type Options = SMTPTransport.Options;

export const MAILER: FactoryProvider<
  Transporter<SMTPTransport.SentMessageInfo> | undefined
> = {
  provide: MAILER_SERVICE,
  useFactory: (config: Config) => {
    return config.mailer ? createTransport(config.mailer) : undefined;
  },
  inject: [Config],
};
