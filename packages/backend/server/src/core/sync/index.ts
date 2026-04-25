import { Module } from '@nestjs/common';

import { AnonymousDocAccessModule } from '../anonymous-doc-access';
import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { SpaceSyncGateway } from './gateway';

@Module({
  imports: [AnonymousDocAccessModule, DocStorageModule, PermissionModule],
  providers: [SpaceSyncGateway],
})
export class SyncModule {}
