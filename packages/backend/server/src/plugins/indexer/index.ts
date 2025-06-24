import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core/config';
import { PermissionModule } from '../../core/permission';
import { IndexerEvent } from './event';
import { SearchProviderFactory } from './factory';
import { IndexerJob } from './job';
import { SearchProviders } from './providers';
import { IndexerResolver } from './resolver';
import { IndexerService } from './service';

@Module({
  imports: [ServerConfigModule, PermissionModule],
  providers: [
    IndexerResolver,
    IndexerService,
    IndexerJob,
    IndexerEvent,
    SearchProviderFactory,
    ...SearchProviders,
  ],
  exports: [IndexerService, SearchProviderFactory],
})
export class IndexerModule {}

export { IndexerService };
export type { SearchDoc } from './types';
