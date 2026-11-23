import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { CommentRealtimeProvider } from './realtime';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule, DocStorageModule],
  providers: [CommentService, CommentRealtimeProvider],
  exports: [CommentService],
})
export class CommentRealtimeModule {}
