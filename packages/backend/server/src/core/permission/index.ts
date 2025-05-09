import { Module } from '@nestjs/common';

import { AccessControllerBuilder } from './builder';
import { DocAccessController } from './doc';
import { EventsListener } from './event';
import { WorkspaceAccessController } from './workspace';

@Module({
  providers: [
    WorkspaceAccessController,
    DocAccessController,
    AccessControllerBuilder,
    EventsListener,
  ],
  exports: [AccessControllerBuilder],
})
export class PermissionModule {}

export { AccessControllerBuilder as AccessController } from './builder';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
