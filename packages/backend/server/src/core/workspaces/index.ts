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
import {
  InviteAbuseDispositionService,
  InviteAbuseWorker,
  InviteQuotaAssertService,
} from './abuse';
import { WorkspacesController } from './controller';
import { WorkspaceEvents } from './event';
import { WorkspaceRealtimeModule } from './realtime.module';
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
  providers: [InviteAbuseDispositionService],
  exports: [InviteAbuseDispositionService],
})
class WorkspaceAbuseModule {}

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
    WorkspaceRealtimeModule,
    WorkspaceAbuseModule,
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
    InviteQuotaAssertService,
    WorkspaceEvents,
    AdminWorkspaceResolver,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}

@Module({
  imports: [WorkspaceAbuseModule],
  providers: [InviteAbuseWorker, WorkspaceStatsJob],
})
export class WorkspaceWorkerModule {}

export {
  getAbuseRequestSource,
  InviteAbuseDispositionService,
  InviteQuotaAssertService,
} from './abuse';
export { WorkspaceRealtimeModule } from './realtime.module';
export { WorkspaceService } from './service';
export { InvitationType, WorkspaceType } from './types';
