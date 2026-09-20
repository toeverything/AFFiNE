import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../config';
import { NotificationModule } from '../notification';
import { PermissionModule } from '../permission';
import { QuotaServiceModule } from '../quota';
import { StorageModule } from '../storage';
import { CommentRealtimeModule } from './realtime.module';
import { CommentResolver } from './resolver';

@Module({
  imports: [
    PermissionModule,
    QuotaServiceModule,
    StorageModule,
    ServerConfigModule,
    NotificationModule,
    CommentRealtimeModule,
  ],
  providers: [CommentResolver],
  exports: [CommentRealtimeModule],
})
export class CommentModule {}

export { CommentRealtimeModule } from './realtime.module';
export { CommentService } from './service';
