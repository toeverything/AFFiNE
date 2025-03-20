import { Injectable } from '@nestjs/common';

import { JobQueue } from '../../base';

@Injectable()
export class Mailer {
  constructor(private readonly queue: JobQueue) {}

  async send(command: Jobs['notification.sendMail']) {
    try {
      await this.queue.add('notification.sendMail', command);
      return true;
    } catch {
      return false;
    }
  }
}
