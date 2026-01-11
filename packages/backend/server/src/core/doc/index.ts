import './config';

import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { PgUserspaceDocStorageAdapter } from './adapters/userspace';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import { DocEventsListener } from './event';
import { DocStorageCronJob } from './job';
import { DocStorageOptions } from './options';
import { DatabaseDocReader, DocReader, DocReaderProvider } from './reader';
import { DocWriter } from './writer';

@Module({
  imports: [QuotaModule, PermissionModule, StorageModule],
  providers: [
    DocStorageOptions,
    PgWorkspaceDocStorageAdapter,
    PgUserspaceDocStorageAdapter,
    DocStorageCronJob,
    DocReaderProvider,
    DatabaseDocReader,
    DocEventsListener,
    DocWriter,
  ],
  exports: [
    DatabaseDocReader,
    DocReader,
    DocWriter,
    PgWorkspaceDocStorageAdapter,
    PgUserspaceDocStorageAdapter,
  ],
})
export class DocStorageModule {}
export {
  // only for doc-service
  DatabaseDocReader,
  DocReader,
  DocWriter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
};

export { DocStorageAdapter, type Editor } from './storage';
