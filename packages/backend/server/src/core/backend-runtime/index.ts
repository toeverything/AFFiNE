import { Global, Module } from '@nestjs/common';

import {
  BackendRuntimeEmbeddingService,
  BackendRuntimeHousekeepingJob,
  BackendRuntimeSearchJob,
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
    BackendRuntimeEmbeddingService,
  ],
  exports: [BackendRuntimeProvider, BackendRuntimeEmbeddingService],
})
export class BackendRuntimeModule {}

@Module({
  imports: [BackendRuntimeModule],
  providers: [BackendRuntimeHousekeepingJob, BackendRuntimeSearchJob],
})
export class BackendRuntimeWorkerModule {}

export { BackendRuntimeEmbeddingService } from './job';
export { BackendRuntimeError, backendRuntimeErrorCode } from './operations';
export {
  BACKEND_RUNTIME_CONFIG_PATHS,
  BackendRuntimeProvider,
  type BlobManifestEntryV1,
  type BlobManifestV1,
  type BlobSourceV1,
  type RuntimeInviteAbuseAction,
  type RuntimeInviteAbuseClaimedAction,
  type RuntimeMailDeliveryQuotaDecision,
  type RuntimeMailDeliveryQuotaInput,
  type RuntimeQuotaSourceInput,
  type RuntimeQuotaTargetDomainInput,
  type RuntimeSeatReservationDecision,
  type RuntimeStorageReservationDecision,
  type RuntimeStorageReservationInput,
  type RuntimeStorageReservationMutation,
  type RuntimeWorkspaceInviteQuotaDecision,
  type RuntimeWorkspaceInviteQuotaInput,
  type RuntimeWorkspaceInviteQuotaUsage,
} from './provider';
