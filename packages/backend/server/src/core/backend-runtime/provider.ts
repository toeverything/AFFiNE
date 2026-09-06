import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from '@nestjs/common';

import { Config, OnEvent } from '../../base';
import { wrapCallMetric } from '../../base/metrics';
import {
  BackendRuntime,
  type BackendRuntimeHealth,
  type ByokLocalLeaseOutput,
  type ByokPolicyOutput,
  type ByokProbeResultOutput,
  type ByokProfileOutput,
  type CompileScopeInput,
  type CopilotExecuteInput,
  type CopilotRouteCheckInput,
  type CreateByokLocalLeaseInput,
  type CreateByokProfileInput,
  type EmbeddingHealth,
  type EnsureWorkspaceBlobArtifactInput,
  type MatchEmbeddingCandidatesInput,
  type ProbeByokDraftInput,
  type ProbeByokProfileInput,
  type PutWorkspaceArtifactInput,
  type ReadEmbeddingSourceContentInput,
  type ReorderByokProfilesInput,
  type ReplaceByokProfileInput,
  type RotateByokCredentialInput,
  type RuntimeTurnScopeSnapshot,
  type RuntimeWorkspaceArtifact,
  type SyncEmbeddingStateInput,
} from '../../native';
import {
  type AggregateRequestInput,
  encodeAggregateRequest,
  encodeSearchRequest,
  type SearchRequestInput,
} from './search';

type RuntimeInstance = InstanceType<typeof BackendRuntime>;

export const BACKEND_RUNTIME_CONFIG_PATHS = Symbol(
  'BACKEND_RUNTIME_CONFIG_PATHS'
);

class RuntimeEventStream<T> implements AsyncIterableIterator<T> {
  private readonly values: T[] = [];
  private readonly readers: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;
  private abort?: () => void;

  attach(abort: () => void) {
    if (this.ended) {
      abort();
      return;
    }
    this.abort = abort;
  }

  push(value?: T) {
    if (this.ended) return;
    if (value === undefined) {
      this.ended = true;
      for (const reader of this.readers.splice(0)) {
        reader({ value: undefined, done: true });
      }
      return;
    }
    const reader = this.readers.shift();
    if (reader) reader({ value, done: false });
    else this.values.push(value);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) return { value, done: false };
    if (this.ended) return { value: undefined, done: true };
    return await new Promise(resolve => this.readers.push(resolve));
  }

  async return(): Promise<IteratorResult<T>> {
    this.abort?.();
    this.push();
    return { value: undefined, done: true };
  }
}

export type RuntimeQuotaTargetDomainInput = {
  domain: string;
  count: number;
};

export type RuntimeQuotaSourceInput = {
  trusted: boolean;
  ip?: string;
  country?: string;
  asn?: number;
  rayId?: string;
};

export type RuntimeWorkspaceInviteQuotaInput = {
  actorUserId: string;
  workspaceId: string;
  requestId?: string;
  targetCount: number;
  targetDomains: RuntimeQuotaTargetDomainInput[];
  source?: RuntimeQuotaSourceInput;
};

export type RuntimeWorkspaceInviteQuotaUsage = {
  targetCount: number;
  targetDomains: RuntimeQuotaTargetDomainInput[];
};

export type RuntimeWorkspaceActionDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
};

export type RuntimeInviteAbuseAction =
  | 'ban_actor'
  | 'quarantine_actor'
  | 'quarantine_workspace'
  | 'quarantine_source_cohort';

const RUNTIME_INVITE_ABUSE_ACTIONS = new Set<RuntimeInviteAbuseAction>([
  'ban_actor',
  'quarantine_actor',
  'quarantine_workspace',
  'quarantine_source_cohort',
]);

export type RuntimeInviteAbuseClaimedAction = {
  action: RuntimeInviteAbuseAction;
  subjectKey: string;
  evidenceId: string;
  actionId: string;
  actorUserId: string;
  workspaceId: string;
};

type NativeRuntimeInviteAbuseClaimedAction = Omit<
  RuntimeInviteAbuseClaimedAction,
  'action'
> & {
  action: string;
};

export type RuntimeWorkspaceInviteQuotaDecision = {
  allowed: boolean;
  reservationId?: string;
  retryAfterSeconds?: number;
  reason?: string;
  scopeKey?: string;
  windowSeconds?: number;
  limit?: number;
  current?: number;
  requested?: number;
  actionRequired?: {
    action: RuntimeInviteAbuseAction;
    subjectKey: string;
    evidenceId: string;
    actionId: string;
  };
};

type NativeRuntimeInviteAbuseActionRequired = Omit<
  NonNullable<RuntimeWorkspaceInviteQuotaDecision['actionRequired']>,
  'action'
> & {
  action: string;
};

type NativeRuntimeWorkspaceInviteQuotaDecision = Omit<
  RuntimeWorkspaceInviteQuotaDecision,
  'actionRequired'
> & {
  actionRequired?: NativeRuntimeInviteAbuseActionRequired;
};

export type RuntimeMailDeliveryQuotaInput = {
  requestId?: string;
  mailName: string;
  recipient: {
    email: string;
    domain: string;
    userId?: string;
  };
  metadata: {
    actorUserId?: string;
    workspaceId?: string;
    notificationId?: string;
    abuseSubjectKey?: string;
  };
  source?: RuntimeQuotaSourceInput;
};

export type RuntimeMailDeliveryQuotaDecision = {
  allowed: boolean;
  reservationId?: string;
  mailClass: string;
  retryAfterSeconds?: number;
  reason?: string;
  scopeKey?: string;
  windowSeconds?: number;
  limit?: number;
  current?: number;
  requested?: number;
};

type RuntimeQuotaMethods = RuntimeInstance & {
  evaluateWorkspaceActionV1(
    actorUserId: string,
    workspaceId: string
  ): Promise<RuntimeWorkspaceActionDecision>;
  assertWorkspaceInviteQuotaV1(
    input: RuntimeWorkspaceInviteQuotaInput
  ): Promise<NativeRuntimeWorkspaceInviteQuotaDecision>;
  commitWorkspaceInviteQuotaV1(
    reservationId: string,
    usage: RuntimeWorkspaceInviteQuotaUsage
  ): Promise<boolean>;
  releaseWorkspaceInviteQuotaV1(reservationId: string): Promise<boolean>;
  assertMailDeliveryQuotaV1(
    input: RuntimeMailDeliveryQuotaInput
  ): Promise<RuntimeMailDeliveryQuotaDecision>;
  commitMailDeliveryQuotaV1(reservationId: string): Promise<boolean>;
  releaseMailDeliveryQuotaV1(reservationId: string): Promise<boolean>;
  cleanupExpiredRollingQuota(limit: number): Promise<number>;
  isInviteAbuseUserQuarantinedOrBanned(userId: string): Promise<boolean>;
  isInviteAbuseWorkspaceQuarantined(workspaceId: string): Promise<boolean>;
  claimInviteAbuseAction(actionId: string, workerId: string): Promise<boolean>;
  claimRetryableInviteAbuseActions(
    workerId: string,
    limit: number
  ): Promise<NativeRuntimeInviteAbuseClaimedAction[]>;
  markInviteAbuseAction(
    actionId: string,
    workerId: string,
    status: 'succeeded' | 'failed',
    error?: string | null
  ): Promise<boolean>;
};

function normalizeInviteAbuseAction(action: string): RuntimeInviteAbuseAction {
  if (RUNTIME_INVITE_ABUSE_ACTIONS.has(action as RuntimeInviteAbuseAction)) {
    return action as RuntimeInviteAbuseAction;
  }
  throw new Error(`Unknown invite abuse action: ${action}`);
}

function normalizeWorkspaceInviteQuotaDecision(
  decision: NativeRuntimeWorkspaceInviteQuotaDecision
): RuntimeWorkspaceInviteQuotaDecision {
  const { actionRequired, ...rest } = decision;
  if (!actionRequired) {
    return rest;
  }

  return {
    ...rest,
    actionRequired: {
      ...actionRequired,
      action: normalizeInviteAbuseAction(actionRequired.action),
    },
  };
}

function normalizeClaimedInviteAbuseAction(
  action: NativeRuntimeInviteAbuseClaimedAction
): RuntimeInviteAbuseClaimedAction {
  return {
    ...action,
    action: normalizeInviteAbuseAction(action.action),
  };
}

@Injectable()
export class BackendRuntimeProvider
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BackendRuntimeProvider.name);
  private readonly runtime: RuntimeInstance;
  private migrationsStarted = false;

  constructor(
    @Optional() private readonly config?: Config,
    @Optional()
    @Inject(BACKEND_RUNTIME_CONFIG_PATHS)
    configPaths?: string[]
  ) {
    this.runtime = new BackendRuntime(
      this.config?.crypto.privateKey,
      configPaths
    );
  }

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    await this.runtime.start();
    const health = await this.runtime.health();
    this.logger.log(`backend runtime started: db=${health.databaseConnected}`);
  }

  /**
   * Schema changes belong to the explicit predeploy path. Runtime startup only
   * connects services and must not mutate the database schema.
   */
  async runMigrations() {
    await this.runMigrationsOnce();
  }

  async stop() {
    await this.runtime.stop();
    this.logger.log('backend runtime stopped');
  }

  @OnEvent('config.changed')
  async onConfigChanged({ updates }: Events['config.changed']) {
    if (
      !updates.copilot &&
      !updates.crypto &&
      !updates.db &&
      !updates.auth &&
      !updates.indexer &&
      !updates.storages
    ) {
      return;
    }
    await this.runtime.reloadConfig(this.config?.crypto.privateKey);
  }

  async health(): Promise<BackendRuntimeHealth> {
    return await this.runtime.health();
  }

  async embeddingHealth(): Promise<EmbeddingHealth> {
    return await this.measured('embeddingHealth', runtime =>
      runtime.embeddingHealth()
    );
  }

  async searchAuthorized(
    actorUserId: string,
    workspaceId: string,
    request: SearchRequestInput
  ) {
    return await this.measured('searchAuthorized', runtime =>
      runtime.searchAuthorized(
        actorUserId,
        workspaceId,
        encodeSearchRequest(request)
      )
    );
  }

  async aggregateAuthorized(
    actorUserId: string,
    workspaceId: string,
    request: AggregateRequestInput
  ) {
    return await this.measured('aggregateAuthorized', runtime =>
      runtime.aggregateAuthorized(
        actorUserId,
        workspaceId,
        encodeAggregateRequest(request)
      )
    );
  }

  async reconcileSearchProjection(limit = 100) {
    return await this.measured('reconcileSearchProjection', runtime =>
      runtime.reconcileSearchProjection(limit)
    );
  }

  async filterReadableDocs(
    actorUserId: string,
    workspaceId: string,
    docIds: string[]
  ) {
    return await this.measured('filterReadableDocs', runtime =>
      runtime.filterReadableDocs(actorUserId, workspaceId, docIds)
    );
  }

  async searchStatus() {
    return await this.measured('searchStatus', runtime =>
      runtime.searchStatus()
    );
  }

  async embeddingQueueCounts() {
    return await this.measured('embeddingQueueCounts', runtime =>
      runtime.embeddingQueueCounts()
    );
  }

  async embeddingWorkspaceProgress(workspaceId: string) {
    return await this.measured('embeddingWorkspaceProgress', runtime =>
      runtime.embeddingWorkspaceProgress(workspaceId)
    );
  }

  async reconcileEmbeddingWorkspaces() {
    return await this.measured('reconcileEmbeddingWorkspaces', runtime =>
      runtime.reconcileEmbeddingWorkspaces()
    );
  }

  async compileTurnScope(
    input: CompileScopeInput
  ): Promise<RuntimeTurnScopeSnapshot> {
    return await this.measured('compileTurnScope', runtime =>
      runtime.compileTurnScope(input)
    );
  }

  async putWorkspaceArtifact(
    input: PutWorkspaceArtifactInput,
    body: Buffer
  ): Promise<RuntimeWorkspaceArtifact> {
    return await this.measured('putWorkspaceArtifact', runtime =>
      runtime.putWorkspaceArtifact(input, body)
    );
  }

  async ensureWorkspaceBlobArtifact(
    input: EnsureWorkspaceBlobArtifactInput
  ): Promise<RuntimeWorkspaceArtifact> {
    return await this.measured('ensureWorkspaceBlobArtifact', runtime =>
      runtime.ensureWorkspaceBlobArtifact(input)
    );
  }

  async syncEmbeddingState(input: SyncEmbeddingStateInput) {
    return await this.measured('syncEmbeddingState', runtime =>
      runtime.syncEmbeddingState(input)
    );
  }

  async readEmbeddingSourceContent(input: ReadEmbeddingSourceContentInput) {
    return await this.measured('readEmbeddingSourceContent', runtime =>
      runtime.readEmbeddingSourceContent(input)
    );
  }

  async matchEmbeddingCandidates(input: MatchEmbeddingCandidatesInput) {
    return await this.measured('matchEmbeddingCandidates', runtime =>
      runtime.matchEmbeddingCandidates(input)
    );
  }

  async cleanupUnreferencedArtifacts(limit: number) {
    return await this.measured('cleanupUnreferencedArtifacts', runtime =>
      runtime.cleanupUnreferencedArtifacts(limit)
    );
  }

  async setArtifactLibraryOwned(
    workspaceId: string,
    artifactId: string,
    libraryOwned: boolean,
    displayName?: string
  ) {
    return await this.measured('setArtifactLibraryOwned', runtime =>
      runtime.setArtifactLibraryOwned(
        workspaceId,
        artifactId,
        libraryOwned,
        displayName
      )
    );
  }

  async cancelEmbeddingCandidateRequest(requestId: string) {
    return await this.measured('cancelEmbeddingCandidateRequest', runtime =>
      runtime.cancelEmbeddingCandidateRequest(requestId)
    );
  }

  async cleanupExpiredSnapshotHistories(limit: number) {
    return await this.measured('cleanupExpiredSnapshotHistories', rt =>
      rt.cleanupExpiredSnapshotHistories(limit)
    );
  }

  async cleanupExpiredUserSessions(limit: number) {
    return await this.measured('cleanupExpiredUserSessions', rt =>
      rt.cleanupExpiredUserSessions(limit)
    );
  }

  async cleanupExpiredRuntimeStates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeStates', rt =>
      rt.cleanupExpiredRuntimeStates(limit)
    );
  }

  async cleanupExpiredRuntimeGates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeGates', rt =>
      rt.cleanupExpiredRuntimeGates(limit)
    );
  }

  async assertWorkspaceInviteQuotaV1(
    input: RuntimeWorkspaceInviteQuotaInput
  ): Promise<RuntimeWorkspaceInviteQuotaDecision> {
    return normalizeWorkspaceInviteQuotaDecision(
      await this.measured('assertWorkspaceInviteQuotaV1', rt =>
        this.quotaRuntime(rt).assertWorkspaceInviteQuotaV1(input)
      )
    );
  }

  async evaluateWorkspaceActionV1(actorUserId: string, workspaceId: string) {
    return await this.measured('evaluateWorkspaceActionV1', rt =>
      this.quotaRuntime(rt).evaluateWorkspaceActionV1(actorUserId, workspaceId)
    );
  }

  async commitWorkspaceInviteQuotaV1(
    reservationId: string,
    usage: RuntimeWorkspaceInviteQuotaUsage
  ): Promise<boolean> {
    return await this.measured('commitWorkspaceInviteQuotaV1', rt =>
      this.quotaRuntime(rt).commitWorkspaceInviteQuotaV1(reservationId, usage)
    );
  }

  async releaseWorkspaceInviteQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('releaseWorkspaceInviteQuotaV1', rt =>
      this.quotaRuntime(rt).releaseWorkspaceInviteQuotaV1(reservationId)
    );
  }

  async assertMailDeliveryQuotaV1(
    input: RuntimeMailDeliveryQuotaInput
  ): Promise<RuntimeMailDeliveryQuotaDecision> {
    return await this.measured('assertMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).assertMailDeliveryQuotaV1(input)
    );
  }

  async commitMailDeliveryQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('commitMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).commitMailDeliveryQuotaV1(reservationId)
    );
  }

  async releaseMailDeliveryQuotaV1(reservationId: string): Promise<boolean> {
    return await this.measured('releaseMailDeliveryQuotaV1', rt =>
      this.quotaRuntime(rt).releaseMailDeliveryQuotaV1(reservationId)
    );
  }

  async cleanupExpiredRollingQuota(limit: number) {
    return await this.measured('cleanupExpiredRollingQuota', rt =>
      this.quotaRuntime(rt).cleanupExpiredRollingQuota(limit)
    );
  }

  async listByokProfiles(workspaceId: string): Promise<ByokProfileOutput[]> {
    return await this.measured('listByokProfiles', runtime =>
      runtime.listByokProfiles(workspaceId)
    );
  }

  async getByokPolicy(): Promise<ByokPolicyOutput> {
    return await this.measured('getByokPolicy', runtime =>
      Promise.resolve(runtime.getByokPolicy())
    );
  }

  async createByokProfile(
    input: CreateByokProfileInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('createByokProfile', runtime =>
      runtime.createByokProfile(input)
    );
  }

  async replaceByokProfile(
    input: ReplaceByokProfileInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('replaceByokProfile', runtime =>
      runtime.replaceByokProfile(input)
    );
  }

  async rotateByokCredential(
    input: RotateByokCredentialInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('rotateByokCredential', runtime =>
      runtime.rotateByokCredential(input)
    );
  }

  async probeByokProfile(
    input: ProbeByokProfileInput
  ): Promise<ByokProbeResultOutput> {
    return await this.measured('probeByokProfile', runtime =>
      runtime.probeByokProfile(input)
    );
  }

  async probeByokDraft(
    input: ProbeByokDraftInput
  ): Promise<ByokProbeResultOutput> {
    return await this.measured('probeByokDraft', runtime =>
      runtime.probeByokDraft(input)
    );
  }

  async deleteByokProfile(workspaceId: string, profileId: string) {
    return await this.measured('deleteByokProfile', runtime =>
      runtime.deleteByokProfile(workspaceId, profileId)
    );
  }

  async reorderByokProfiles(
    input: ReorderByokProfilesInput
  ): Promise<ByokProfileOutput[]> {
    return await this.measured('reorderByokProfiles', runtime =>
      runtime.reorderByokProfiles(input)
    );
  }

  async createByokLocalLease(
    input: CreateByokLocalLeaseInput
  ): Promise<ByokLocalLeaseOutput> {
    return await this.measured('createByokLocalLease', runtime =>
      runtime.createByokLocalLease(input)
    );
  }

  async executeCopilot(input: CopilotExecuteInput) {
    const output = await this.measured('executeCopilot', runtime =>
      runtime.executeCopilot(input)
    );
    return JSON.parse(output) as {
      events: Array<{
        type: 'route_selected' | 'route_failed' | 'usage';
        route: {
          profileId: string;
          source: 'server' | 'local' | 'affine_cloud';
          provider: string;
          model: string;
        };
        errorKind?: string;
        usage?: unknown;
      }>;
      result: unknown;
    };
  }

  async assertCopilotRoute(input: CopilotRouteCheckInput) {
    await this.measured('assertCopilotRoute', runtime =>
      runtime.assertCopilotRoute(input)
    );
  }

  streamCopilot<TEvent>(
    input: CopilotExecuteInput,
    toolCallback: (request: string) => Promise<string>,
    options: { maxSteps: number; signal?: AbortSignal }
  ): AsyncIterableIterator<TEvent> {
    const stream = new RuntimeEventStream<TEvent>();
    const endMarker = '__AFFINE_COPILOT_STREAM_END__';
    void this.runtime
      .executeCopilotStream(
        input,
        options.maxSteps,
        (error, value) => {
          if (error) {
            stream.push({
              type: 'error',
              errorKind: 'callback',
              message: error.message,
            } as TEvent);
          } else if (value === endMarker) {
            stream.push();
          } else {
            stream.push(JSON.parse(value) as TEvent);
          }
        },
        async (error, request) => {
          if (error) throw error;
          return await toolCallback(request);
        }
      )
      .then(handle => {
        stream.attach(() => handle.abort());
        if (options.signal?.aborted) handle.abort();
        else
          options.signal?.addEventListener('abort', () => handle.abort(), {
            once: true,
          });
      })
      .catch(error => {
        stream.push({
          type: 'error',
          errorKind: 'setup',
          message: error instanceof Error ? error.message : String(error),
        } as TEvent);
        stream.push();
      });
    return stream;
  }

  async isInviteAbuseUserQuarantinedOrBanned(userId: string) {
    return await this.measured('isInviteAbuseUserQuarantinedOrBanned', rt =>
      this.quotaRuntime(rt).isInviteAbuseUserQuarantinedOrBanned(userId)
    );
  }

  async isInviteAbuseWorkspaceQuarantined(workspaceId: string) {
    return await this.measured('isInviteAbuseWorkspaceQuarantined', rt =>
      this.quotaRuntime(rt).isInviteAbuseWorkspaceQuarantined(workspaceId)
    );
  }

  async claimInviteAbuseAction(actionId: string, workerId: string) {
    return await this.measured('claimInviteAbuseAction', rt =>
      this.quotaRuntime(rt).claimInviteAbuseAction(actionId, workerId)
    );
  }

  async claimRetryableInviteAbuseActions(
    workerId: string,
    limit: number
  ): Promise<RuntimeInviteAbuseClaimedAction[]> {
    return (
      await this.measured('claimRetryableInviteAbuseActions', rt =>
        this.quotaRuntime(rt).claimRetryableInviteAbuseActions(workerId, limit)
      )
    ).map(normalizeClaimedInviteAbuseAction);
  }

  async markInviteAbuseAction(
    actionId: string,
    workerId: string,
    status: 'succeeded' | 'failed',
    error?: string | null
  ) {
    return await this.measured('markInviteAbuseAction', rt =>
      this.quotaRuntime(rt).markInviteAbuseAction(
        actionId,
        workerId,
        status,
        error
      )
    );
  }

  private async measured<T>(
    method: string,
    fn: (runtime: RuntimeInstance) => Promise<T>
  ): Promise<T> {
    return await wrapCallMetric(
      () => fn(this.runtime),
      'storage',
      'backend_runtime',
      { method }
    )();
  }

  private quotaRuntime(runtime: RuntimeInstance): RuntimeQuotaMethods {
    return runtime as unknown as RuntimeQuotaMethods;
  }

  private async runMigrationsOnce() {
    if (this.migrationsStarted) {
      return;
    }
    await this.runtime.runMigrations();
    this.migrationsStarted = true;
  }
}
