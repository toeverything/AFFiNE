import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { DocStorageModule } from '../../core/doc';
import { FeatureModule } from '../../core/features';
import { PermissionModule } from '../../core/permission';
import { QuotaModule } from '../../core/quota';
import { StorageModule } from '../../core/storage';
import { WorkspaceModule } from '../../core/workspaces';
import { IndexerModule } from '../indexer';
import { CopilotController } from './controller';
import { CopilotFeatureGuard, CopilotFeatureService } from './feature';
import { WorkspaceMcpController } from './mcp/controller';
import { McpCredentialService } from './mcp/credential';
import { McpCredentialResolver } from './mcp/resolver';
import {
  COPILOT_API_PROVIDERS,
  COPILOT_FEATURE_PROVIDERS,
  COPILOT_KERNEL_PROVIDERS,
  COPILOT_TRANSCRIPT_REALTIME_PROVIDERS,
} from './module-providers';

const COPILOT_SHARED_IMPORTS = [
  DocStorageModule,
  FeatureModule,
  QuotaModule,
  PermissionModule,
  ServerConfigModule,
  StorageModule,
  WorkspaceModule,
  IndexerModule,
];

@Module({
  imports: [ServerConfigModule],
  providers: [CopilotFeatureService, CopilotFeatureGuard],
  exports: [CopilotFeatureService, CopilotFeatureGuard],
})
export class CopilotAvailabilityModule {}

@Module({
  imports: [...COPILOT_SHARED_IMPORTS, CopilotAvailabilityModule],
  providers: [...COPILOT_KERNEL_PROVIDERS],
  exports: [CopilotAvailabilityModule, ...COPILOT_KERNEL_PROVIDERS],
})
export class CopilotKernelModule {}

@Module({
  imports: [PermissionModule, CopilotAvailabilityModule, CopilotKernelModule],
  providers: [...COPILOT_TRANSCRIPT_REALTIME_PROVIDERS],
})
export class CopilotRealtimeModule {}

@Module({
  imports: [...COPILOT_SHARED_IMPORTS, CopilotKernelModule],
  providers: [...COPILOT_FEATURE_PROVIDERS],
  exports: [...COPILOT_FEATURE_PROVIDERS],
})
export class CopilotFeatureModule {}

@Module({
  imports: [
    ...COPILOT_SHARED_IMPORTS,
    CopilotKernelModule,
    CopilotFeatureModule,
  ],
  providers: [...COPILOT_API_PROVIDERS],
  exports: [...COPILOT_API_PROVIDERS],
})
export class CopilotApiModule {}

@Module({
  imports: [
    PermissionModule,
    CopilotKernelModule,
    CopilotFeatureModule,
    CopilotApiModule,
  ],
  providers: [McpCredentialService, McpCredentialResolver],
  controllers: [CopilotController, WorkspaceMcpController],
})
export class CopilotModule {}
