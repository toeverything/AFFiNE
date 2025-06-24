import { Module } from '@nestjs/common';

import { HelperProcessManager } from './helper-process.service';

@Module({
  providers: [HelperProcessManager],
  exports: [HelperProcessManager],
})
export class HelperProcessModule {}
