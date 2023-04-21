import { Module } from '@nestjs/common';

import { PermissionService } from './permission';
import { WorkspaceResolver } from './resolver';

@Module({
  providers: [WorkspaceResolver, PermissionService],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { WorkspaceType } from './resolver';
