import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { CommentResolver } from './resolver';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule, StorageModule],
  providers: [CommentResolver, CommentService],
  exports: [CommentService],
})
export class CommentModule {}
