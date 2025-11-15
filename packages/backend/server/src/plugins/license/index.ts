import { Module } from '@nestjs/common';

import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { WorkspaceModule } from '../../core/workspaces';
import { LicenseResolver } from './resolver';
import { LicenseService } from './service';

@Module({
  imports: [QuotaModule, PermissionModule, WorkspaceModule],
  providers: [LicenseService, LicenseResolver],
})
export class LicenseModule {}
