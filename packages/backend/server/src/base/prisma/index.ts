import './config';

import { Global, Module, Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { PrismaFactory } from './factory';

// only `PrismaClient` can be injected
const clientProvider: Provider = {
  provide: PrismaClient,
  useFactory: (factory: PrismaFactory) => {
    return factory.get();
  },
  inject: [PrismaFactory],
};

@Global()
@Module({
  providers: [PrismaFactory, clientProvider],
  exports: [clientProvider],
})
export class PrismaModule {}
export { PrismaFactory };

export type PrismaTransaction = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];
