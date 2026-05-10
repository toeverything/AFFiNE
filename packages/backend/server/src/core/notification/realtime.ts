import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import type { RealtimeRegistry } from '../realtime';
import { notificationCountRoom } from './realtime-room';
import { NotificationService } from './service';

@Injectable()
export class NotificationRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly service: NotificationService,
    @Optional() private readonly registry?: RealtimeRegistry
  ) {}

  onModuleInit() {
    this.registry?.registerRequest({
      name: 'notification.count.get',
      input: z.object({}).strict(),
      handle: async user => ({
        count: await this.service.countByUserId(user.id),
      }),
    });

    this.registry?.registerTopic({
      name: 'notification.count.changed',
      input: z.object({}).strict(),
      authorize: async () => {},
      room: user => {
        if (!user) {
          throw new Error('User is required for notification count room');
        }
        return notificationCountRoom(user.id);
      },
    });
  }
}
