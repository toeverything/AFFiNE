import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../config';
import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { CommentRealtimeProvider } from './realtime';
import { CommentResolver } from './resolver';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule, StorageModule, ServerConfigModule],
  providers: [CommentResolver, CommentService, CommentRealtimeProvider],
  exports: [CommentService],
})
export class CommentModule {}
