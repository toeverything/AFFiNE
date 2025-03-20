import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { MailModule } from '../mail';
import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { NotificationJob } from './job';
import { NotificationResolver, UserNotificationResolver } from './resolver';
import { NotificationService } from './service';

@Module({
  imports: [PermissionModule, DocStorageModule, StorageModule, MailModule],
  providers: [
    UserNotificationResolver,
    NotificationResolver,
    NotificationService,
    NotificationJob,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
