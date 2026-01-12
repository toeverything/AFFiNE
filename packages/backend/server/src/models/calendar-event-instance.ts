import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

@Injectable()
export class CalendarEventInstanceModel extends BaseModel {
  async deleteByEventIds(eventIds: string[]) {
    if (eventIds.length === 0) {
      return;
    }

    await this.db.calendarEventInstance.deleteMany({
      where: { calendarEventId: { in: eventIds } },
    });
  }
}
