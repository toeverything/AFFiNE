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
import { WorkspaceEvents } from './event';
import {
  DocHistoryResolver,
  DocResolver,
  TeamWorkspaceResolver,
  WorkspaceBlobResolver,
  WorkspaceDocResolver,
  WorkspaceResolver,
  WorkspaceService,
} from './resolvers';

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
    TeamWorkspaceResolver,
    WorkspaceDocResolver,
    DocResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
    WorkspaceService,
    WorkspaceEvents,
  ],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}

export { InvitationType, WorkspaceType } from './types';
