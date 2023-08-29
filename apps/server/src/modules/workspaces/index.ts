import { Module } from '@nestjs/common';

import { DocModule } from '../doc';
import { WorkspacesController } from './controller';
import { PermissionService } from './permission';
import { WorkspaceResolver } from './resolver';

@Module({
  imports: [DocModule.forFeature()],
  controllers: [WorkspacesController],
  providers: [WorkspaceResolver, PermissionService],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { InvitationType, WorkspaceType } from './resolver';
