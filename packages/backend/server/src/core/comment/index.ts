import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../config';
import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { CommentResolver } from './resolver';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule, StorageModule, ServerConfigModule],
  providers: [CommentResolver, CommentService],
  exports: [CommentService],
})
export class CommentModule {}
