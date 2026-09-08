import './config';

import { Module } from '@nestjs/common';

import { BackendRuntimeModule } from '../backend-runtime';
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
  imports: [BackendRuntimeModule, QuotaModule, PermissionModule, StorageModule],
  providers: [
    DocStorageOptions,
    PgWorkspaceDocStorageAdapter,
    PgUserspaceDocStorageAdapter,
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

@Module({
  imports: [DocStorageModule],
  providers: [DocStorageCronJob],
})
export class DocStorageWorkerModule {}

export {
  DatabaseDocReader,
  DocReader,
  DocWriter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
};

export { DocStorageAdapter, type Editor } from './storage';
