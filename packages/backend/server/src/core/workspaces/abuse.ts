import { createHash, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Request } from 'express';

import {
  ActionForbidden,
  Config,
  getRequestClientIp,
  JobQueue,
  metrics,
  OnJob,
  TooManyRequest,
  type UserFriendlyError,
} from '../../base';
import { Models } from '../../models';
import {
  BackendRuntimeProvider,
  type RuntimeQuotaSourceInput,
  type RuntimeQuotaTargetDomainInput,
  type RuntimeWorkspaceInviteQuotaDecision,
} from '../backend-runtime';
import { QuotaService } from '../quota/service';

type ActionRequired = NonNullable<
  RuntimeWorkspaceInviteQuotaDecision['actionRequired']
>;

export type InviteQuotaAdmission = {
  reservationId?: string;
  decision: RuntimeWorkspaceInviteQuotaDecision;
};

declare global {
  interface Jobs {
    'inviteAbuse.executePendingActions': {};
  }
}

export function canUserExecuteLimitedActions(
  user: { createdAt: Date },
  minimumAccountAgeMs: number
) {
  if (minimumAccountAgeMs <= 0) return true;
  return Date.now() - user.createdAt.getTime() >= minimumAccountAgeMs;
}

function parseAsn(value: string | undefined) {
  if (!value) {
    return;
  }
  const asn = Number(value);
  return Number.isSafeInteger(asn) && asn > 0 && asn <= 0xffffffff
    ? asn
    : undefined;
}

export function getAbuseRequestSource(
  req: Request | undefined,
  config: Config
): RuntimeQuotaSourceInput {
  if (!req || !config.auth.trustedCloudflareHeaders) {
    return { trusted: false };
  }

  return {
    trusted: true,
    ip: getRequestClientIp(req),
    country: req.get('CF-IPCountry')?.trim() || undefined,
    asn: parseAsn(req.get('x-affine-cf-asn')),
    rayId: req.get('CF-Ray')?.trim() || undefined,
  };
}

function hashLogValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

@Injectable()
export class InviteAbuseDispositionService {
  private readonly logger = new Logger(InviteAbuseDispositionService.name);
  private readonly workerOwnerId = randomUUID();
  private readonly inlineWorkerId = `node-inline:${this.workerOwnerId}`;

  constructor(
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider,
    private readonly queue: JobQueue
  ) {}

  async execute(input: {
    actionRequired?: ActionRequired;
    actorUserId: string;
    workspaceId: string;
    alreadyClaimed?: boolean;
    workerId?: string;
  }) {
    const { actionRequired } = input;
    if (!actionRequired) {
      return;
    }
    const workerId = input.workerId ?? this.inlineWorkerId;

    try {
      if (!input.alreadyClaimed) {
        const claimed = await this.runtime.claimInviteAbuseAction(
          actionRequired.actionId,
          workerId
        );
        if (!claimed) {
          return;
        }
      }

      switch (actionRequired.action) {
        case 'ban_actor':
          await this.cancelPendingActorArtifacts(input, actionRequired);
          await this.models.session.deleteUserSessions(input.actorUserId);
          await this.models.user.ban(input.actorUserId);
          break;
        case 'quarantine_actor':
          await this.cancelPendingActorArtifacts(input, actionRequired);
          await this.models.session.deleteUserSessions(input.actorUserId);
          break;
        case 'quarantine_workspace':
          await this.cancelPendingWorkspaceArtifacts(input.workspaceId);
          break;
        case 'quarantine_source_cohort':
          await this.models.mailDelivery.cancelByAbuseSubject(
            actionRequired.subjectKey,
            'source_cohort_quarantined'
          );
          break;
        default:
          throw new Error(
            `Unknown invite abuse action: ${actionRequired.action}`
          );
      }

      await this.runtime.markInviteAbuseAction(
        actionRequired.actionId,
        workerId,
        'succeeded'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to execute action.';
      await this.runtime.markInviteAbuseAction(
        actionRequired.actionId,
        workerId,
        'failed',
        message
      );
      this.logger.error('Failed to execute invite abuse disposition', {
        userId: input.actorUserId,
        workspaceId: input.workspaceId,
        action: actionRequired.action,
        actionId: actionRequired.actionId,
        evidenceId: actionRequired.evidenceId,
        subjectKey: actionRequired.subjectKey,
        error: message,
      });
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async enqueuePendingActions() {
    await this.queue.add(
      'inviteAbuse.executePendingActions',
      {},
      { jobId: 'invite-abuse-execute-pending-actions' }
    );
  }

  @OnJob('inviteAbuse.executePendingActions')
  async executePendingActions() {
    const workerId = `node:${this.workerOwnerId}`;
    const actions = await this.runtime.claimRetryableInviteAbuseActions(
      workerId,
      20
    );
    for (const action of actions) {
      await this.execute({
        actorUserId: action.actorUserId,
        workspaceId: action.workspaceId,
        alreadyClaimed: true,
        workerId,
        actionRequired: {
          action: action.action,
          subjectKey: action.subjectKey,
          evidenceId: action.evidenceId,
          actionId: action.actionId,
        },
      });
    }
  }

  private async cancelPendingActorArtifacts(
    input: {
      actorUserId: string;
      workspaceId: string;
    },
    action: ActionRequired
  ) {
    await this.models.mailDelivery.cancelByActor(input.actorUserId);
    await this.models.mailDelivery.cancelByWorkspace(input.workspaceId);
    await this.models.mailDelivery.cancelByAbuseSubject(action.subjectKey);

    await this.models.workspaceInvitation.cancelPendingByActor(
      input.actorUserId
    );
  }

  private async cancelPendingWorkspaceArtifacts(workspaceId: string) {
    await this.models.mailDelivery.cancelByWorkspace(workspaceId);
    await this.models.workspaceInvitation.cancelPendingByWorkspace(workspaceId);
  }
}

@Injectable()
export class InviteQuotaAssertService {
  private readonly logger = new Logger(InviteQuotaAssertService.name);

  constructor(
    private readonly config: Config,
    private readonly quota: QuotaService,
    private readonly runtime: BackendRuntimeProvider,
    private readonly disposition: InviteAbuseDispositionService
  ) {}

  async assertWorkspaceInviteQuota(input: {
    actorUserId: string;
    workspaceId: string;
    requestId?: string;
    targetCount: number;
    targetDomains: RuntimeQuotaTargetDomainInput[];
    source?: RuntimeQuotaSourceInput;
  }): Promise<InviteQuotaAdmission> {
    const start = Date.now();
    const seatQuota = await this.quota.getWorkspaceSeatQuota(input.workspaceId);
    let decision: RuntimeWorkspaceInviteQuotaDecision;
    try {
      decision = await this.runtime.assertWorkspaceInviteQuotaV1(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'native assert failed';
      metrics.workspace.counter('invite_quota_runtime_fallback').add(1, {
        mode: this.config.auth.inviteQuotaFailOpenOnRuntimeError
          ? 'fail_open'
          : 'fail_closed',
      });
      this.logger.error('Workspace invite quota native assert failed', {
        userId: input.actorUserId,
        workspaceId: input.workspaceId,
        targetCount: input.targetCount,
        targetDomainsSummary: input.targetDomains,
        sourceTrusted: input.source?.trusted ?? false,
        country: input.source?.country,
        asn: input.source?.asn,
        requestId: input.requestId,
        cfRay: input.source?.rayId,
        error: message,
      });
      if (this.config.auth.inviteQuotaFailOpenOnRuntimeError) {
        return { decision: { allowed: true, requested: input.targetCount } };
      }
      throw new TooManyRequest();
    }
    metrics.workspace
      .counter('invite_quota_requested_targets')
      .add(input.targetCount);
    metrics.workspace
      .histogram('invite_quota_counter_latency_ms')
      .record(Date.now() - start);

    if (!decision.allowed) {
      metrics.workspace.counter('invite_quota_rejected').add(1, {
        reason: decision.reason ?? 'unknown',
      });
      metrics.workspace.counter('invite_quota_reject_by_reason').add(1, {
        reason: decision.reason ?? 'unknown',
      });
      if (this.config.auth.inviteQuotaShadowMode) {
        this.logger.warn('Workspace invite quota shadow rejected', {
          userId: input.actorUserId,
          workspaceId: input.workspaceId,
          targetCount: input.targetCount,
          targetDomainsSummary: input.targetDomains,
          sourceTrusted: input.source?.trusted ?? false,
          country: input.source?.country,
          asn: input.source?.asn,
          reason: decision.reason,
          scopeKeyHash: hashLogValue(decision.scopeKey),
          limit: decision.limit,
          current: decision.current,
          requested: decision.requested,
          memberLimit: seatQuota.memberLimit,
          memberCount: seatQuota.memberCount,
          retryAfter: decision.retryAfterSeconds,
          requestId: input.requestId,
          cfRay: input.source?.rayId,
          wouldDispose: decision.actionRequired?.action,
        });
        return { decision };
      }

      try {
        await this.disposition.execute({
          actionRequired: decision.actionRequired,
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
        });
      } catch (error) {
        this.logger.error('Workspace invite quota disposition failed', {
          userId: input.actorUserId,
          workspaceId: input.workspaceId,
          action: decision.actionRequired?.action,
          actionId: decision.actionRequired?.actionId,
          reason: decision.reason,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      this.logger.warn('Workspace invite quota rejected', {
        userId: input.actorUserId,
        workspaceId: input.workspaceId,
        targetCount: input.targetCount,
        targetDomainsSummary: input.targetDomains,
        sourceTrusted: input.source?.trusted ?? false,
        country: input.source?.country,
        asn: input.source?.asn,
        reason: decision.reason,
        scopeKeyHash: hashLogValue(decision.scopeKey),
        limit: decision.limit,
        current: decision.current,
        requested: decision.requested,
        memberLimit: seatQuota.memberLimit,
        memberCount: seatQuota.memberCount,
        retryAfter: decision.retryAfterSeconds,
        requestId: input.requestId,
        cfRay: input.source?.rayId,
      });
      throw this.mapDecision(decision);
    }

    metrics.workspace.counter('invite_quota_allowed').add(1);
    return {
      reservationId: decision.reservationId,
      decision,
    };
  }

  async commitWorkspaceInviteQuota(
    reservationId: string | undefined,
    usage: {
      targetCount: number;
      targetDomains: RuntimeQuotaTargetDomainInput[];
    }
  ) {
    if (!reservationId) {
      return false;
    }
    return await this.runtime.commitWorkspaceInviteQuotaV1(
      reservationId,
      usage
    );
  }

  async releaseWorkspaceInviteQuota(reservationId: string | undefined) {
    if (!reservationId) {
      return false;
    }
    return await this.runtime.releaseWorkspaceInviteQuotaV1(reservationId);
  }

  private mapDecision(
    decision: RuntimeWorkspaceInviteQuotaDecision
  ): UserFriendlyError {
    if (decision.reason === 'abuse_subject' || decision.actionRequired) {
      return new ActionForbidden('This feature is temporarily unavailable.');
    }
    return new TooManyRequest();
  }
}
