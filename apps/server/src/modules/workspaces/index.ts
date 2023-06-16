import { Module } from '@nestjs/common';

import { WorkspacesController } from './controller';
import { PermissionService } from './permission';
import { WorkspaceResolver } from './resolver';

@Module({
  providers: [WorkspaceResolver, PermissionService, WorkspacesController],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { WorkspaceType } from './resolver';
