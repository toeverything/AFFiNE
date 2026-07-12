import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { wrapCallMetric } from '../../base/metrics';
import { BackendRuntime, type BackendRuntimeHealth } from '../../native';

type RuntimeInstance = InstanceType<typeof BackendRuntime>;

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
  private readonly runtime: RuntimeInstance = new BackendRuntime();
  private migrationsStarted = false;

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    await this.runtime.start();
    await this.runMigrationsOnce();
    const health = await this.runtime.health();
    this.logger.log(`backend runtime started: db=${health.databaseConnected}`);
  }

  async stop() {
    await this.runtime.stop();
    this.logger.log('backend runtime stopped');
  }

  async health(): Promise<BackendRuntimeHealth> {
    return await this.runtime.health();
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
