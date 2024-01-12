import { Global, Module, Provider } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from './service';

// both `PrismaService` and `PrismaClient` can be injected
const clientProvider: Provider = {
  provide: PrismaClient,
  useExisting: PrismaService,
};

@Global()
@Module({
  providers: [PrismaService, clientProvider],
  exports: [PrismaService, clientProvider],
})
export class PrismaModule {}
export { PrismaService } from './service';
