import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { SpaceSyncGateway } from './gateway';

@Module({
  imports: [DocStorageModule, PermissionModule],
  providers: [SpaceSyncGateway],
})
export class SyncModule {}
