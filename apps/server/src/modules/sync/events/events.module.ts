import { Module } from '@nestjs/common';

import { EventsGateway } from './events.gateway';
import { WorkspaceService } from './workspace';

@Module({
  providers: [EventsGateway, WorkspaceService],
})
export class EventsModule {}
