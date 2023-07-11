import { Module } from '@nestjs/common';

import { UpdateManagerModule } from '../../update-manager';
import { EventsGateway } from './events.gateway';
import { WorkspaceService } from './workspace';

@Module({
  imports: [UpdateManagerModule.forFeature()],
  providers: [EventsGateway, WorkspaceService],
})
export class EventsModule {}
