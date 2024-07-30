import './config';

import { Global, Module, Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Config } from '../config';
import { PrismaService } from './service';

// only `PrismaClient` can be injected
const clientProvider: Provider = {
  provide: PrismaClient,
  useFactory: (config: Config) => {
    if (PrismaService.INSTANCE) {
      return PrismaService.INSTANCE;
    }

    return new PrismaService(config.database);
  },
  inject: [Config],
};

@Global()
@Module({
  providers: [clientProvider],
  exports: [clientProvider],
})
export class PrismaModule {}
export { PrismaService } from './service';

export type PrismaTransaction = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];
