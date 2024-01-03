import { Module } from '@nestjs/common';

import { DocModule } from '../doc';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UsersService } from '../users';
import { WorkspacesController } from './controller';
import { PermissionService } from './permission';
import {
  DocHistoryResolver,
  PagePermissionResolver,
  WorkspaceBlobResolver,
  WorkspaceResolver,
} from './resolvers';

@Module({
  imports: [DocModule, QuotaModule, StorageModule],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceResolver,
    PermissionService,
    UsersService,
    PagePermissionResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
  ],
  exports: [PermissionService],
})
export class WorkspaceModule {}
export { InvitationType, WorkspaceType } from './resolvers';
