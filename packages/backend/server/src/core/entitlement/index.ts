import { Module } from '@nestjs/common';

import { EntitlementService } from './service';

@Module({
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}

export { EntitlementService };
