import { Module } from '@nestjs/common';

import { QuotaService } from '../quota/service';
import { StorageModule } from '../storage';
import { AccessControllerBuilder } from './builder';
import { DocAccessController } from './doc';
import { EventsListener } from './event';
import { WorkspacePolicyService } from './policy';
import { WorkspaceAccessController } from './workspace';

@Module({
  imports: [StorageModule],
  providers: [
    QuotaService,
    WorkspaceAccessController,
    DocAccessController,
    AccessControllerBuilder,
    EventsListener,
    WorkspacePolicyService,
  ],
  exports: [AccessControllerBuilder, WorkspacePolicyService],
})
export class PermissionModule {}

export { AccessControllerBuilder as AccessController } from './builder';
export { WorkspacePolicyService } from './policy';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
