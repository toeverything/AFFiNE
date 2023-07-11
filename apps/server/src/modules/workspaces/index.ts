import { Module } from '@nestjs/common';

import { UpdateManagerModule } from '../update-manager';
import { WorkspacesController } from './controller';
import { PermissionService } from './permission';
import { WorkspaceResolver } from './resolver';

@Module({
  imports: [UpdateManagerModule.forFeature()],
  controllers: [WorkspacesController],
  providers: [WorkspaceResolver, PermissionService],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { WorkspaceType } from './resolver';
