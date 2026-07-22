import { Global, Module } from '@nestjs/common';

import { BackendRuntimeHousekeepingJob } from './job';
import { BackendRuntimeProvider } from './provider';

@Global()
@Module({
  providers: [BackendRuntimeProvider, BackendRuntimeHousekeepingJob],
  exports: [BackendRuntimeProvider],
})
export class BackendRuntimeModule {}

export {
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
