import { Global, Module } from '@nestjs/common';

import { BackendRuntimeHousekeepingJob } from './job';
import { BackendRuntimeProvider } from './provider';

@Global()
@Module({
  providers: [BackendRuntimeProvider, BackendRuntimeHousekeepingJob],
  exports: [BackendRuntimeProvider],
})
export class BackendRuntimeModule {}

export { BackendRuntimeProvider } from './provider';
