import { Global, Module } from '@nestjs/common';

import {
  BackendRuntimeEmbeddingJob,
  BackendRuntimeHousekeepingJob,
} from './job';
import {
  BACKEND_RUNTIME_CONFIG_PATH,
  BackendRuntimeProvider,
} from './provider';

@Global()
@Module({
  providers: [
    { provide: BACKEND_RUNTIME_CONFIG_PATH, useValue: undefined },
    BackendRuntimeProvider,
    BackendRuntimeEmbeddingJob,
    BackendRuntimeHousekeepingJob,
  ],
  exports: [BackendRuntimeProvider],
})
export class BackendRuntimeModule {}

export {
  BACKEND_RUNTIME_CONFIG_PATH,
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
