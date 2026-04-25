import { Module } from '@nestjs/common';

import { AnonymousDocAccessModule } from '../anonymous-doc-access';
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
import { WorkspaceEvents } from './event';
import {
  AnonymousDocAccessResolver,
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
    AnonymousDocAccessModule,
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
    AnonymousDocAccessResolver,
    WorkspaceDocResolver,
    DocResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
    WorkspaceService,
    WorkspaceEvents,
    AdminWorkspaceResolver,
    WorkspaceStatsJob,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}

export { WorkspaceService } from './service';
export { InvitationType, WorkspaceType } from './types';
