import { Global, Module } from '@nestjs/common';

import { PrismaService } from './service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
export { PrismaService } from './service';
