import { existsSync } from 'node:fs';

import { Global, Module } from '@nestjs/common';

import { CONFIG_JSON_PATHS } from '../../base/config/register';
import {
  BackendRuntimeEmbeddingJob,
  BackendRuntimeHousekeepingJob,
} from './job';
import {
  BACKEND_RUNTIME_CONFIG_PATHS,
  BackendRuntimeProvider,
} from './provider';

@Global()
@Module({
  providers: [
    {
      provide: BACKEND_RUNTIME_CONFIG_PATHS,
      useValue: CONFIG_JSON_PATHS.filter(existsSync),
    },
    BackendRuntimeProvider,
    BackendRuntimeEmbeddingJob,
    BackendRuntimeHousekeepingJob,
  ],
  exports: [BackendRuntimeProvider],
})
export class BackendRuntimeModule {}

export {
  BACKEND_RUNTIME_CONFIG_PATHS,
  BackendRuntimeProvider,
  type RuntimeInviteAbuseAction,
  type RuntimeInviteAbuseClaimedAction,
  type RuntimeMailDeliveryQuotaDecision,
  type RuntimeMailDeliveryQuotaInput,
  type RuntimeQuotaSourceInput,
  type RuntimeQuotaTargetDomainInput,
  type RuntimeWorkspaceInviteQuotaDecision,
  type RuntimeWorkspaceInviteQuotaInput,
  type RuntimeWorkspaceInviteQuotaUsage,
} from './provider';
