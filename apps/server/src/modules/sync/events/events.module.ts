import { Module } from '@nestjs/common';

import { DocModule } from '../../doc';
import { EventsGateway } from './events.gateway';
import { WorkspaceService } from './workspace';

@Module({
  imports: [DocModule.forFeature()],
  providers: [EventsGateway, WorkspaceService],
})
export class EventsModule {}
