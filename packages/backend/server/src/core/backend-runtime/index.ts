import { Global, Module } from '@nestjs/common';

import { BackendRuntimeBlobJob } from './blob-job';
import { BackendRuntimeHousekeepingJob } from './job';
import { BackendRuntimeProvider } from './provider';

@Global()
@Module({
  providers: [
    BackendRuntimeProvider,
    BackendRuntimeBlobJob,
    BackendRuntimeHousekeepingJob,
  ],
  exports: [BackendRuntimeProvider, BackendRuntimeBlobJob],
})
export class BackendRuntimeModule {}

export { BackendRuntimeProvider } from './provider';
