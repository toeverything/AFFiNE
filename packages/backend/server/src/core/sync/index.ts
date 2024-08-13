import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { QuotaModule } from '../quota';
import { PgUserspaceDocStorageAdapter } from './adapters/userspace';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import { SpaceSyncGateway } from './gateway';
import { DocStorageOptions } from './options';

@Module({
  imports: [PermissionModule, QuotaModule],
  providers: [
    SpaceSyncGateway,
    DocStorageOptions,
    PgWorkspaceDocStorageAdapter,
    PgUserspaceDocStorageAdapter,
  ],
})
export class SyncModule {}
