import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createTestAccount,
  createTransport,
  getTestMessageUrl,
  SendMailOptions,
  Transporter,
} from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { Config, metrics } from '../../base';

export type SendOptions = Omit<SendMailOptions, 'to' | 'subject' | 'html'> & {
  to: string;
  subject: string;
  html: string;
};

@Injectable()
export class MailSender implements OnModuleInit {
  private readonly logger = new Logger(MailSender.name);
  private smtp: Transporter<SMTPTransport.SentMessageInfo> | null = null;
  private usingTestAccount = false;
  constructor(private readonly config: Config) {}

  onModuleInit() {
    this.createSMTP(this.config.mailer);
  }

  createSMTP(config: SMTPTransport.Options) {
    if (config.host) {
      this.smtp = createTransport(config);
    } else if (this.config.node.dev) {
      createTestAccount((err, account) => {
        if (!err) {
          this.smtp = createTransport({
            from: 'noreply@toeverything.info',
            ...this.config.mailer,
            ...account.smtp,
            auth: {
              user: account.user,
              pass: account.pass,
            },
          });
          this.usingTestAccount = true;
        }
      });
    } else {
      this.logger.warn('Mailer SMTP transport is not configured.');
    }
  }

  async send(name: string, options: SendOptions) {
    if (!this.smtp) {
      this.logger.warn(`Mailer SMTP transport is not configured to send mail.`);
      return null;
    }

    metrics.mail.counter('send_total').add(1, { name });
    try {
      const result = await this.smtp.sendMail({
        from: this.config.mailer.from,
        ...options,
      });

      if (result.rejected.length > 0) {
        metrics.mail.counter('rejected_total').add(1, { name });
        this.logger.error(
          `Mail [${name}] rejected with response: ${result.response}`
        );
        return false;
      }

      metrics.mail.counter('accepted_total').add(1, { name });
      this.logger.log(`Mail [${name}] sent successfully.`);
      if (this.usingTestAccount) {
        this.logger.debug(
          `  ⚙️ Mail preview url: ${getTestMessageUrl(result)}`
        );
      }

      return true;
    } catch (e) {
      metrics.mail.counter('failed_total').add(1, { name });
      this.logger.error(`Failed to send mail [${name}].`, e);
      return false;
    }
  }
}
