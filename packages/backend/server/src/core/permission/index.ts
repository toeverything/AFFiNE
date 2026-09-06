import { Module } from '@nestjs/common';

import { QuotaServiceModule } from '../quota/service.module';
import { AccessControllerBuilder } from './builder';
import { PermissionContextLoader } from './context-loader';
import { EventsListener } from './event';
import { WorkspacePolicyService } from './policy';
import { PermissionService } from './service';

@Module({
  imports: [QuotaServiceModule],
  providers: [
    AccessControllerBuilder,
    EventsListener,
    WorkspacePolicyService,
    PermissionContextLoader,
    PermissionService,
  ],
  exports: [AccessControllerBuilder, WorkspacePolicyService, PermissionService],
})
export class PermissionModule {}

export { AccessControllerBuilder as PermissionAccess } from './builder';
export { PermissionContextLoader } from './context-loader';
export {
  type DotToUnderline,
  mapPermissionsToGraphqlPermissions,
} from './permission-map';
export { WorkspacePolicyService } from './policy';
export { PermissionService } from './service';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
