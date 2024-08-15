import { Module } from '@nestjs/common';

import { DocModule } from '../../doc';
import { PermissionModule } from '../../permission';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [DocModule, PermissionModule],
  providers: [EventsGateway],
})
export class EventsModule {}
