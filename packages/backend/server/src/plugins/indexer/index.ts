import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core/config';
import { PermissionModule } from '../../core/permission';
import { SearchProviderFactory } from './factory';
import { SearchProviders } from './providers';
import { IndexerResolver } from './resolver';
import { IndexerService } from './service';

@Module({
  imports: [ServerConfigModule, PermissionModule],
  providers: [
    IndexerResolver,
    IndexerService,
    SearchProviderFactory,
    ...SearchProviders,
  ],
  exports: [IndexerService, SearchProviderFactory],
})
export class IndexerModule {}

export { IndexerService };
