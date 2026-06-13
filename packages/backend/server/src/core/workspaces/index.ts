import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { DocRendererModule } from '../doc-renderer';
import { FeatureModule } from '../features';
import { MailModule } from '../mail';
import { NotificationModule } from '../notification';
import { PermissionModule } from '../permission';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UserModule } from '../user';
import { WorkspacesController } from './controller';
import { DocGrantsService } from './doc-grants';
import {
  DocGrantsRealtimeProvider,
  DocShareRealtimeProvider,
} from './doc-realtime';
import { WorkspaceEvents } from './event';
import {
  WorkspaceAccessRealtimeProvider,
  WorkspaceConfigRealtimeProvider,
  WorkspaceMembersRealtimeProvider,
} from './realtime';
import {
  DocHistoryResolver,
  DocResolver,
  WorkspaceBlobResolver,
  WorkspaceDocResolver,
  WorkspaceMemberResolver,
  WorkspaceResolver,
} from './resolvers';
import { AdminWorkspaceResolver } from './resolvers/admin';
import { WorkspaceService } from './service';
import { WorkspaceStatsJob } from './stats.job';

@Module({
  imports: [
    DocStorageModule,
    DocRendererModule,
    FeatureModule,
    QuotaModule,
    StorageModule,
    UserModule,
    PermissionModule,
    NotificationModule,
    MailModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceResolver,
    WorkspaceMemberResolver,
    WorkspaceDocResolver,
    DocResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
    WorkspaceService,
    DocGrantsService,
    WorkspaceEvents,
    WorkspaceAccessRealtimeProvider,
    WorkspaceConfigRealtimeProvider,
    WorkspaceMembersRealtimeProvider,
    DocShareRealtimeProvider,
    DocGrantsRealtimeProvider,
    AdminWorkspaceResolver,
    WorkspaceStatsJob,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}

export { WorkspaceService } from './service';
export { InvitationType, WorkspaceType } from './types';
