import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { CommentResolver } from './resolver';
import { CommentService } from './service';

@Module({
  imports: [PermissionModule],
  providers: [CommentResolver, CommentService],
  exports: [CommentService],
})
export class CommentModule {}
