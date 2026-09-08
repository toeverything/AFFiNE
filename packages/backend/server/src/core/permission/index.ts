import { Module } from '@nestjs/common';

import { AccessControllerBuilder } from './builder';
import { EventsListener } from './event';
import { PermissionService } from './service';

@Module({
  providers: [AccessControllerBuilder, EventsListener, PermissionService],
  exports: [AccessControllerBuilder, PermissionService],
})
export class PermissionModule {}

export { AccessControllerBuilder as PermissionAccess } from './builder';
export {
  type DotToUnderline,
  mapPermissionsToGraphqlPermissions,
} from './permission-map';
export { PermissionService } from './service';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
