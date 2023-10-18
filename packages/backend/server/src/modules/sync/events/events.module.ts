import { Module } from '@nestjs/common';

import { DocModule } from '../../doc';
import { PermissionService } from '../../workspaces/permission';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [DocModule.forFeature()],
  providers: [EventsGateway, PermissionService],
})
export class EventsModule {}
