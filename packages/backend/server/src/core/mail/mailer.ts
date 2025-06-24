import { Injectable } from '@nestjs/common';

import { EmailServiceNotConfigured, JobQueue } from '../../base';
import { MailSender } from './sender';

@Injectable()
export class Mailer {
  constructor(
    private readonly queue: JobQueue,
    private readonly sender: MailSender
  ) {}

  /**
   * try to send mail
   *
   * @note never throw
   */
  async trySend(command: Jobs['notification.sendMail']) {
    return this.send(command, true);
  }

  async send(command: Jobs['notification.sendMail'], suppressError = false) {
    if (!this.sender.configured) {
      if (suppressError) {
        return false;
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
