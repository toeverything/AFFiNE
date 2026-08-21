import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core/config';
import { DocStorageModule } from '../../core/doc';
import { PermissionModule } from '../../core/permission';
import { IndexerEvent } from './event';
import { IndexerJob } from './job';
import { IndexerResolver } from './resolver';
import { IndexerScheduler } from './scheduler';
import { IndexerService } from './service';

const INDEXER_SHARED_IMPORTS = [
  ServerConfigModule,
  DocStorageModule,
  PermissionModule,
];

@Module({
  imports: INDEXER_SHARED_IMPORTS,
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerServiceModule {}

@Module({
  imports: [IndexerServiceModule],
  providers: [IndexerEvent],
})
export class IndexerProducerModule {}

@Module({
  imports: [IndexerServiceModule, DocStorageModule, PermissionModule],
  providers: [IndexerJob, IndexerScheduler],
})
export class IndexerWorkerModule {}

@Module({
  imports: [IndexerServiceModule, DocStorageModule, PermissionModule],
  providers: [IndexerResolver, IndexerEvent],
  exports: [IndexerServiceModule],
})
export class IndexerModule {}

export { IndexerService };
export type { SearchDoc } from './types';
