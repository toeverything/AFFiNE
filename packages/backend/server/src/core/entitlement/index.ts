import { Module } from '@nestjs/common';

import { LegacyEntitlementProjectionService } from './projection';
import { EntitlementProjectionChecker } from './projection-checker';
import { EntitlementService } from './service';

@Module({
  providers: [
    EntitlementService,
    LegacyEntitlementProjectionService,
    EntitlementProjectionChecker,
  ],
  exports: [
    EntitlementService,
    LegacyEntitlementProjectionService,
    EntitlementProjectionChecker,
  ],
})
export class EntitlementModule {}

export { EntitlementService };
export { EntitlementProjectionChecker };
export { LegacyEntitlementProjectionService };
