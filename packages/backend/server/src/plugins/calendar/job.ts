import { Injectable } from '@nestjs/common';

import { OnJob } from '../../base';
import { CalendarService } from './service';

declare global {
  interface Jobs {
    'calendar.syncSubscription': {
      subscriptionId: string;
      reason?: 'polling' | 'webhook' | 'on-demand';
    };
  }
}

@Injectable()
export class CalendarJob {
  constructor(private readonly calendar: CalendarService) {}

  @OnJob('calendar.syncSubscription')
  async syncSubscription({
    subscriptionId,
    reason,
  }: Jobs['calendar.syncSubscription']) {
    await this.calendar.syncSubscription(subscriptionId, { reason });
  }
}
