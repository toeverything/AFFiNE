import { Global, Module } from '@nestjs/common';

import {
  BackendRuntimeEmbeddingJob,
  BackendRuntimeEmbeddingProducer,
  BackendRuntimeEmbeddingService,
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
    BackendRuntimeEmbeddingService,
  ],
  exports: [BackendRuntimeProvider, BackendRuntimeEmbeddingService],
})
export class BackendRuntimeModule {}

@Module({
  imports: [BackendRuntimeModule],
  providers: [BackendRuntimeEmbeddingProducer],
})
export class BackendRuntimeProducerModule {}

@Module({
  imports: [BackendRuntimeModule],
  providers: [BackendRuntimeEmbeddingJob, BackendRuntimeHousekeepingJob],
})
export class BackendRuntimeWorkerModule {}

export {
  BackendRuntimeEmbeddingJob,
  BackendRuntimeEmbeddingProducer,
  BackendRuntimeEmbeddingService,
  BackendRuntimeHousekeepingJob,
} from './job';
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
