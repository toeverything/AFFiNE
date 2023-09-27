import { Module } from '@nestjs/common';

import { DocModule } from '../../doc';
import { PermissionService } from '../../workspaces/permission';
import { EventsGateway } from './events.gateway';
import { WorkspaceService } from './workspace';

@Module({
  imports: [DocModule.forFeature()],
  providers: [EventsGateway, PermissionService, WorkspaceService],
})
export class EventsModule {}
