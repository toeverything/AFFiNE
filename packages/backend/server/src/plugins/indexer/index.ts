import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core/config';
import { DocStorageModule } from '../../core/doc';
import { PermissionModule } from '../../core/permission';
import { IndexerResolver } from './resolver';
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
  imports: [IndexerServiceModule, DocStorageModule, PermissionModule],
  providers: [IndexerResolver],
  exports: [IndexerServiceModule],
})
export class IndexerModule {}

export { IndexerService };
export type { SearchDoc } from './types';
