import './config';

import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { QuotaModule } from '../quota';
import { PgUserspaceDocStorageAdapter } from './adapters/userspace';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import { DocStorageCronJob } from './job';
import { DocStorageOptions } from './options';

@Module({
  imports: [QuotaModule, PermissionModule],
  providers: [
    DocStorageOptions,
    PgWorkspaceDocStorageAdapter,
    PgUserspaceDocStorageAdapter,
    DocStorageCronJob,
  ],
  exports: [PgWorkspaceDocStorageAdapter, PgUserspaceDocStorageAdapter],
})
export class DocStorageModule {}
export { PgUserspaceDocStorageAdapter, PgWorkspaceDocStorageAdapter };

export { DocStorageAdapter, type Editor } from './storage';
