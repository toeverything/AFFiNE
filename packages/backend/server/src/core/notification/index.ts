import { Module } from '@nestjs/common';

import { BackendRuntimeModule } from '../backend-runtime';
import { DocStorageModule } from '../doc';
import { MailModule } from '../mail';
import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { NotificationJob } from './job';
import { NotificationRealtimeProvider } from './realtime';
import { NotificationResolver, UserNotificationResolver } from './resolver';
import { NotificationService } from './service';

@Module({
  imports: [BackendRuntimeModule, DocStorageModule, MailModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
class NotificationCoreModule {}

@Module({
  imports: [PermissionModule, StorageModule, NotificationCoreModule],
  providers: [
    UserNotificationResolver,
    NotificationResolver,
    NotificationRealtimeProvider,
  ],
  exports: [NotificationCoreModule],
})
export class NotificationModule {}

@Module({
  imports: [NotificationCoreModule],
  providers: [NotificationJob],
})
export class NotificationWorkerModule {}
