import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationService } from './service';

const CLEANUP_BATCH_SIZE = 1000;
const CLEANUP_MAX_BATCHES = 100;

@Injectable()
export class NotificationJob {
  constructor(private readonly service: NotificationService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredNotifications() {
    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      const count = await this.service.cleanExpiredNotifications();
      if (count < CLEANUP_BATCH_SIZE) break;
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async deliverPendingCommentNotifications() {
    await this.service.deliverPendingComments();
  }
}
