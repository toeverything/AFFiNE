import { Module } from '@nestjs/common';

import { BootstrapService } from './service';

@Module({
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
