import { Module } from '@nestjs/common';

import { EntitlementModule } from '../../core/entitlement';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { WorkspaceModule } from '../../core/workspaces';
import { AdminLicenseResolver, LicenseResolver } from './resolver';
import { LicenseService } from './service';

@Module({
  imports: [
    FeatureModule,
    QuotaModule,
    PermissionModule,
    WorkspaceModule,
    EntitlementModule,
  ],
  providers: [LicenseService, LicenseResolver, AdminLicenseResolver],
})
export class LicenseModule {}
