import { Module } from '@nestjs/common';

import { DocModule } from '../doc';
import { QuotaModule } from '../quota';
import { UsersService } from '../users';
import { WorkspacesController } from './controller';
import { DocHistoryResolver } from './history.resolver';
import { PermissionService } from './permission';
import { PagePermissionResolver, WorkspaceResolver } from './resolver';

@Module({
  imports: [DocModule, QuotaModule],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceResolver,
    PermissionService,
    UsersService,
    PagePermissionResolver,
    DocHistoryResolver,
  ],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { InvitationType, WorkspaceType } from './resolver';
