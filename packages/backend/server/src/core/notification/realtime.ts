import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import {
  realtimeNotificationRoom,
  type RealtimeRegistry,
  registerRealtimeLiveQuery,
} from '../realtime';
import { NotificationService } from './service';

@Injectable()
export class NotificationRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly service: NotificationService,
    @Optional() private readonly registry?: RealtimeRegistry
  ) {}

  onModuleInit() {
    const input = z.object({}).strict();
    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'notification.count.get',
        input,
        handle: async user => ({
          count: await this.service.countByUserId(user.id),
        }),
      },
      topic: {
        name: 'notification.count.changed',
        input,
        authorize: async () => {},
        room: user => {
          if (!user) {
            throw new Error('User is required for notification count room');
          }
          return realtimeNotificationRoom(user.id);
        },
      },
    });
  }
}
