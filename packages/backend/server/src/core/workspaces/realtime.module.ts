import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { QuotaServiceModule } from '../quota';
import { DocGrantsService } from './doc-grants';
import {
  DocGrantsRealtimeProvider,
  DocShareRealtimeProvider,
} from './doc-realtime';
import {
  WorkspaceAccessRealtimeProvider,
  WorkspaceConfigRealtimeProvider,
  WorkspaceMembersRealtimeProvider,
} from './realtime';

@Module({
  imports: [DocStorageModule, PermissionModule, QuotaServiceModule],
  providers: [
    DocGrantsService,
    WorkspaceAccessRealtimeProvider,
    WorkspaceConfigRealtimeProvider,
    WorkspaceMembersRealtimeProvider,
    DocShareRealtimeProvider,
    DocGrantsRealtimeProvider,
  ],
  exports: [DocGrantsService],
})
export class WorkspaceRealtimeModule {}
