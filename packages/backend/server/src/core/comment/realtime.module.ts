import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { CommentRealtimeProvider } from './realtime';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule],
  providers: [CommentService, CommentRealtimeProvider],
  exports: [CommentService],
})
export class CommentRealtimeModule {}
