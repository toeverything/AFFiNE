import { Module } from '@nestjs/common';

import { QuotaServiceModule } from '../quota/service.module';
import { AccessControllerBuilder } from './builder';
import { DocAccessController } from './doc';
import { EventsListener } from './event';
import { WorkspacePolicyService } from './policy';
import { WorkspaceAccessController } from './workspace';

@Module({
  imports: [QuotaServiceModule],
  providers: [
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
