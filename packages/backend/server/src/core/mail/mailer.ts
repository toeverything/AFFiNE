import { Injectable, Logger } from '@nestjs/common';

import { EmailServiceNotConfigured, JobQueue } from '../../base';
import { MailSender } from './sender';

@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);

  constructor(
    private readonly queue: JobQueue,
    private readonly sender: MailSender
  ) {}

  get enabled() {
    // @ts-expect-error internal api
    return this.sender.smtp !== null;
  }

  async send(command: Jobs['notification.sendMail']) {
    if (!this.enabled) {
      if (env.selfhosted) {
        this.logger.log(
          `Email service is not configured, skip send mail name: ${command.name}`
        );
        return true;
      }

      throw new EmailServiceNotConfigured();
    }

    try {
      await this.queue.add('notification.sendMail', command);
      return true;
    } catch {
      return false;
    }
  }
}
