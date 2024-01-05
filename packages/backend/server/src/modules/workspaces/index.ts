import { Module } from '@nestjs/common';

import { DocModule } from '../doc';
import { FeatureModule } from '../features';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UsersService } from '../users';
import { WorkspacesController } from './controller';
import { WorkspaceManagementResolver } from './management';
import { PermissionService } from './permission';
import {
  DocHistoryResolver,
  PagePermissionResolver,
  WorkspaceBlobResolver,
  WorkspaceResolver,
} from './resolvers';

@Module({
  imports: [DocModule, FeatureModule, QuotaModule, StorageModule],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceResolver,
    WorkspaceManagementResolver,
    PermissionService,
    UsersService,
    PagePermissionResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
  ],
  exports: [PermissionService],
})
export class WorkspaceModule {}

export type { InvitationType, WorkspaceType } from './types';
