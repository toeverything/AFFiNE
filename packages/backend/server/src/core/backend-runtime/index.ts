import { Global, Module } from '@nestjs/common';

import { CRYPTO_KEY_SOURCE } from '../../base/helpers/crypto';
import {
  BackendRuntimeEmbeddingService,
  BackendRuntimeHousekeepingJob,
  BackendRuntimeSearchJob,
} from './job';
import { BackendRuntimeProvider } from './provider';

@Global()
@Module({
  providers: [
    BackendRuntimeProvider,
    BackendRuntimeEmbeddingService,
    { provide: CRYPTO_KEY_SOURCE, useExisting: BackendRuntimeProvider },
  ],
  exports: [
    BackendRuntimeProvider,
    BackendRuntimeEmbeddingService,
    CRYPTO_KEY_SOURCE,
  ],
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
