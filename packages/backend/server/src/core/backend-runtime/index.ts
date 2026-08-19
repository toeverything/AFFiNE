import { Global, Module } from '@nestjs/common';

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
      useValue: undefined,
    },
    BackendRuntimeProvider,
    BackendRuntimeEmbeddingJob,
    BackendRuntimeHousekeepingJob,
  ],
  exports: [BackendRuntimeProvider, BackendRuntimeEmbeddingJob],
})
export class BackendRuntimeModule {}

export { BackendRuntimeEmbeddingJob } from './job';
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
