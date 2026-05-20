import { Injectable } from '@nestjs/common';
import { Entitlement, Prisma, PrismaClient } from '@prisma/client';

import { BadRequest, CryptoHelper, EventBus } from '../../base';
import { resolveEntitlementV1 } from '../../native';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from '../../plugins/payment/types';

type TargetType = 'user' | 'workspace' | 'instance';
type EntitlementStatus =
  | 'active'
  | 'grace'
  | 'expired'
  | 'revoked'
  | 'needs_reupload';

export interface CloudSubscriptionEntitlementInput {
  targetId: string;
  plan: SubscriptionPlan | string;
  recurring: SubscriptionRecurring | string;
  status: string;
  quantity?: number | null;
  variant?: SubscriptionVariant | string | null;
  provider?: string | null;
  subscriptionId?: string | number | null;
  stripeSubscriptionId?: string | null;
  start?: Date | null;
  end?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  canceledAt?: Date | null;
}

export interface SelfhostLicenseEntitlementInput {
  workspaceId: string;
  licenseKey?: string;
  recurring?: SubscriptionRecurring | string;
  quantity?: number;
  validateKey?: string | null;
  variant?: SubscriptionVariant | string | null;
  expiresAt?: Date | null;
  validatedAt?: Date | null;
  license?: Buffer | null;
}

interface RemoteSelfhostLicense {
  plan: string;
  recurring: string;
  quantity: number;
  endAt: number;
}

const REMOTE_SELFHOST_LICENSE_REVALIDATE_INTERVAL = 1000 * 60 * 10;
const REMOTE_SELFHOST_LICENSE_HEALTH_TIMEOUT = 10_000;

declare global {
  interface Events {
    'entitlement.changed': {
      targetType: TargetType;
      targetId: string;
    };
  }
}

@Injectable()
export class EntitlementService {
  private readonly legacyCloudSubscriptionSyncs = new Map<
    string,
    Promise<void>
  >();
  private readonly remoteSelfhostLicenseVerifications = new Map<
    string,
    Promise<Entitlement | null>
  >();
  private readonly remoteSelfhostLicenseCache = new Map<
    string,
    { entitlement: Entitlement; verifiedUntil: number }
  >();

  constructor(
    private readonly db: PrismaClient,
    private readonly crypto: CryptoHelper,
    private readonly event: EventBus
  ) {}

  getUserEntitlements(userId: string) {
    return this.db.entitlement.findMany({
      where: { targetType: 'user', targetId: userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  getWorkspaceEntitlements(workspaceId: string) {
    return this.db.entitlement.findMany({
      where: { targetType: 'workspace', targetId: workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  resolveUserEntitlement(userId: string) {
    return this.resolveBestEntitlement('user', userId);
  }

  resolveWorkspaceEntitlement(workspaceId: string) {
    return this.resolveBestEntitlement('workspace', workspaceId);
  }

  async getBestEntitlement(targetType: TargetType, targetId: string) {
    await this.syncLegacyCloudSubscriptionEntitlements(targetType, targetId);
    const entitlements = await this.db.entitlement.findMany({
      where: {
        targetType,
        targetId,
        plan: targetType === 'user' ? { not: 'ai' } : undefined,
        AND: [
          this.validSelfhostEntitlementWhere(),
          this.validEntitlementWhereForTarget(targetType, new Date()),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const sorted = entitlements.sort(
      (a, b) => this.priority(b) - this.priority(a)
    );
    if (!env.selfhosted || targetType !== 'workspace') {
      return sorted[0];
    }

    for (const entitlement of sorted) {
      if (entitlement.signedPayload) {
        return entitlement;
      }

      const verified = await this.verifyRemoteSelfhostLicense(entitlement);
      if (verified) {
        return verified;
      }
    }

    return;
  }

  async getActiveEntitlements(targetType: TargetType, targetId: string) {
    await this.syncLegacyCloudSubscriptionEntitlements(targetType, targetId);
    return this.db.entitlement.findMany({
      where: {
        targetType,
        targetId,
        AND: [
          this.validSelfhostEntitlementWhere(),
          this.validEntitlementWhereForTarget(targetType, new Date()),
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsertFromCloudSubscription(
    input: CloudSubscriptionEntitlementInput,
    options: { emit?: boolean; legacySync?: boolean } = {}
  ) {
    const emit = options.emit ?? true;
    const targetType = this.targetTypeForPlan(input.plan);
    const subjectId = this.cloudSubjectId(input);
    const status = this.statusFromSubscription(input.status);
    const entitlement = await this.findBySubject(
      'cloud_subscription',
      subjectId
    );

    const data = {
      targetType,
      targetId: input.targetId,
      source: 'cloud_subscription',
      plan: this.entitlementPlan(input.plan, input.recurring),
      status,
      subjectId,
      quantity:
        targetType === 'workspace'
          ? this.normalizedQuantity(input.quantity)
          : undefined,
      metadata: {
        provider: input.provider ?? 'stripe',
        recurring: input.recurring,
        variant: input.variant ?? null,
        subscriptionId: input.subscriptionId ?? null,
        stripeSubscriptionId: input.stripeSubscriptionId ?? null,
        legacySync: options.legacySync ?? false,
      },
      startsAt: input.start ?? undefined,
      expiresAt: input.end ?? undefined,
      graceUntil:
        status === 'grace' ? (input.trialEnd ?? input.end ?? new Date()) : null,
      validatedAt: new Date(),
    };

    if (entitlement) {
      const updated = await this.db.entitlement.update({
        where: { id: entitlement.id },
        data,
      });
      if (emit) {
        await this.emitEntitlementChanged(updated);
      }
      return updated;
    }

    const created = await this.db.entitlement.create({ data });
    if (emit) {
      await this.emitEntitlementChanged(created);
    }
    return created;
  }

  async upsertAdminGrant(input: {
    targetType: Exclude<TargetType, 'instance'>;
    targetId: string;
    plan: string;
    quantity?: number | null;
  }) {
    this.assertAdminGrantInput(input.targetType, input.plan);
    if (env.selfhosted) {
      throw new BadRequest(
        'Self-hosted commercial entitlements require a signed license.'
      );
    }
    const quantity =
      input.targetType === 'workspace'
        ? this.normalizedQuantity(input.quantity)
        : undefined;
    resolveEntitlementV1({
      deploymentType: 'cloud',
      targetType: input.targetType,
      targetId: input.targetId,
      plan: input.plan,
      quantity,
      now: new Date().toISOString(),
    });

    const subjectId = this.adminGrantSubjectId(
      input.targetType,
      input.targetId
    );
    const data = {
      targetType: input.targetType,
      targetId: input.targetId,
      source: 'admin_grant',
      plan: input.plan,
      status: 'active',
      subjectId,
      quantity,
      metadata: {},
      validatedAt: new Date(),
    };
    const existing = await this.findBySubject('admin_grant', subjectId);
    const entitlement = existing
      ? await this.db.entitlement.update({
          where: { id: existing.id },
          data,
        })
      : await this.db.entitlement.create({ data });
    const replaced = await this.db.entitlement.findMany({
      where: {
        source: 'admin_grant',
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['active', 'grace'] },
        id: { not: entitlement.id },
      },
    });
    await this.db.entitlement.updateMany({
      where: { id: { in: replaced.map(entitlement => entitlement.id) } },
      data: { status: 'revoked' },
    });
    await this.emitEntitlementChanged(entitlement);
    return entitlement;
  }

  async revokeAdminGrant(
    targetType: Exclude<TargetType, 'instance'>,
    targetId: string
  ) {
    const entitlements = await this.db.entitlement.findMany({
      where: {
        source: 'admin_grant',
        targetType,
        targetId,
        status: { in: ['active', 'grace'] },
      },
    });
    await this.db.entitlement.updateMany({
      where: { id: { in: entitlements.map(entitlement => entitlement.id) } },
      data: { status: 'revoked' },
    });
    await Promise.all(
      entitlements.map(entitlement => this.emitEntitlementChanged(entitlement))
    );
  }

  async syncLegacyCloudSubscriptionEntitlements(
    targetType: TargetType,
    targetId: string
  ) {
    if (env.selfhosted || targetType === 'instance') {
      return;
    }

    const key = `${targetType}:${targetId}`;
    const existing = this.legacyCloudSubscriptionSyncs.get(key);
    if (existing) {
      return existing;
    }

    const task = this.doSyncLegacyCloudSubscriptionEntitlements(
      targetType,
      targetId
    )
      .then(changed => {
        if (changed) {
          this.event.emit('entitlement.changed', { targetType, targetId });
        }
      })
      .finally(() => {
        this.legacyCloudSubscriptionSyncs.delete(key);
      });
    this.legacyCloudSubscriptionSyncs.set(key, task);
    return task;
  }

  async upsertFromSelfhostLicense(input: SelfhostLicenseEntitlementInput) {
    const resolved = input.license
      ? resolveEntitlementV1({
          deploymentType: 'selfhosted',
          targetType: 'workspace',
          targetId: input.workspaceId,
          signedPayload: input.license,
          publicKey: this.crypto.AFFiNEProPublicKey?.toString(),
          licenseAesKey: this.crypto.AFFiNEProLicenseAESKey?.toString('hex'),
          now: new Date().toISOString(),
        })
      : null;
    const valid = resolved?.valid === true;
    const subjectId = resolved?.subjectId ?? input.licenseKey;
    if (!subjectId) {
      throw new Error('selfhost license key is required');
    }
    const entitlement = await this.findBySubject('selfhost_license', subjectId);

    const data = {
      targetType: 'workspace',
      targetId: input.workspaceId,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: valid ? 'active' : ('needs_reupload' as EntitlementStatus),
      subjectId,
      quantity: valid ? resolved.quantity : undefined,
      signedPayload: input.license ?? undefined,
      metadata: {
        recurring: resolved?.recurring ?? input.recurring,
        validateKey: input.validateKey ?? '',
        variant: input.variant ?? null,
        errorCode: resolved?.errorCode ?? (valid ? null : 'needs_reupload'),
        errorMessage:
          resolved?.errorMessage ??
          (valid ? null : 'Self-hosted license needs raw payload to verify.'),
      },
      expiresAt:
        input.expiresAt ??
        (resolved?.expiresAt ? new Date(resolved.expiresAt) : undefined),
      validatedAt: input.validatedAt ?? new Date(),
    };

    if (entitlement) {
      const updated = await this.db.entitlement.update({
        where: { id: entitlement.id },
        data,
      });
      await this.emitEntitlementChanged(updated);
      return updated;
    }

    const created = await this.db.entitlement.create({ data });
    await this.emitEntitlementChanged(created);
    return created;
  }

  async upsertFromValidatedSelfhostLicense(
    input: Omit<SelfhostLicenseEntitlementInput, 'license'> & {
      licenseKey: string;
      quantity: number;
    }
  ) {
    const entitlement = await this.findBySubject(
      'selfhost_license',
      input.licenseKey
    );
    const data = {
      targetType: 'workspace',
      targetId: input.workspaceId,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: 'active' as EntitlementStatus,
      subjectId: input.licenseKey,
      quantity: this.normalizedQuantity(input.quantity),
      signedPayload: null,
      metadata: {
        recurring: input.recurring,
        validateKey: input.validateKey ?? '',
        variant: input.variant ?? null,
        remoteValidated: true,
      },
      expiresAt: input.expiresAt ?? undefined,
      validatedAt: input.validatedAt ?? new Date(),
    };

    if (entitlement) {
      const updated = await this.db.entitlement.update({
        where: { id: entitlement.id },
        data,
      });
      await this.emitEntitlementChanged(updated);
      return updated;
    }

    const created = await this.db.entitlement.create({ data });
    await this.emitEntitlementChanged(created);
    return created;
  }

  async markSelfhostLicenseNeedsReupload(input: {
    workspaceId?: string;
    licenseKey: string;
    reason: string;
  }) {
    const entitlement = await this.findBySubject(
      'selfhost_license',
      input.licenseKey
    );
    const targetType = input.workspaceId ? 'workspace' : 'instance';
    const data = {
      targetType,
      targetId: input.workspaceId ?? input.licenseKey,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: 'needs_reupload' as EntitlementStatus,
      subjectId: input.licenseKey,
      quantity: null,
      metadata: {
        errorCode: 'needs_reupload',
        errorMessage: input.reason,
      },
      validatedAt: new Date(),
    };

    if (entitlement) {
      const updated = await this.db.entitlement.update({
        where: { id: entitlement.id },
        data,
      });
      await this.emitEntitlementChanged(updated);
      return updated;
    }

    const created = await this.db.entitlement.create({ data });
    await this.emitEntitlementChanged(created);
    return created;
  }

  async revokeBySubject(source: string, subjectId: string) {
    const entitlements = await this.db.entitlement.findMany({
      where: { source, subjectId, status: { in: ['active', 'grace'] } },
    });
    await this.db.entitlement.updateMany({
      where: { source, subjectId, status: { in: ['active', 'grace'] } },
      data: { status: 'revoked' },
    });
    await Promise.all(
      entitlements.map(entitlement => this.emitEntitlementChanged(entitlement))
    );
  }

  async revokeCloudSubscription(input: {
    targetId: string;
    plan: SubscriptionPlan | string;
    subscriptionId?: string | number | null;
    stripeSubscriptionId?: string | null;
  }) {
    await this.db.subscription.updateMany({
      where: {
        targetId: input.targetId,
        plan: input.plan,
      },
      data: {
        status: SubscriptionStatus.Canceled,
        end: new Date(),
      },
    });
    await this.revokeBySubject(
      'cloud_subscription',
      this.cloudSubjectId(input)
    );
    if (
      !input.stripeSubscriptionId &&
      typeof input.subscriptionId !== 'string'
    ) {
      await this.revokeCloudSubscriptionByLegacyTarget(input);
    }
  }

  async builtinFree(targetType: TargetType) {
    return resolveEntitlementV1({
      deploymentType: env.selfhosted ? 'selfhosted' : 'cloud',
      targetType,
      now: new Date().toISOString(),
    });
  }

  private async resolveBestEntitlement(
    targetType: TargetType,
    targetId: string
  ) {
    const entitlement = await this.getBestEntitlement(targetType, targetId);

    if (!entitlement) {
      return this.builtinFree(targetType);
    }

    const deploymentType =
      env.selfhosted &&
      entitlement.source === 'selfhost_license' &&
      !entitlement.signedPayload
        ? 'cloud'
        : env.selfhosted
          ? 'selfhosted'
          : 'cloud';

    try {
      return resolveEntitlementV1({
        deploymentType,
        targetType,
        targetId,
        plan: entitlement.plan,
        quantity: entitlement.quantity ?? undefined,
        signedPayload: entitlement.signedPayload
          ? Buffer.from(entitlement.signedPayload)
          : undefined,
        publicKey: this.crypto.AFFiNEProPublicKey?.toString(),
        licenseAesKey: this.crypto.AFFiNEProLicenseAESKey?.toString('hex'),
        now: new Date().toISOString(),
      });
    } catch (e) {
      if (
        env.selfhosted &&
        entitlement.source === 'selfhost_license' &&
        entitlement.plan === 'selfhost_team'
      ) {
        await this.markRemoteSelfhostLicenseNeedsReupload(
          entitlement,
          e instanceof Error ? e.message : 'Invalid self-hosted license.'
        );
        return this.builtinFree(targetType);
      }

      throw e;
    }
  }

  private findBySubject(source: string, subjectId: string) {
    return this.db.entitlement.findFirst({
      where: { source, subjectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private adminGrantSubjectId(targetType: TargetType, targetId: string) {
    return `admin_grant:${targetType}:${targetId}`;
  }

  private assertAdminGrantInput(targetType: string, plan: string) {
    const plans =
      targetType === 'user'
        ? ['pro', 'lifetime_pro', 'ai']
        : targetType === 'workspace'
          ? ['team']
          : null;
    if (!plans?.includes(plan)) {
      throw new BadRequest(
        `Admin grant plan ${plan} is not configurable for ${targetType}`
      );
    }
  }

  private async doSyncLegacyCloudSubscriptionEntitlements(
    targetType: Exclude<TargetType, 'instance'>,
    targetId: string
  ) {
    let changed = false;
    const legacyPlans =
      targetType === 'user'
        ? [SubscriptionPlan.Pro, SubscriptionPlan.AI]
        : [SubscriptionPlan.Team];
    const entitlementPlans =
      targetType === 'user' ? ['pro', 'lifetime_pro', 'ai'] : ['team'];
    const subscriptions = await this.db.subscription.findMany({
      where: {
        targetId,
        plan: { in: legacyPlans },
      },
      orderBy: { updatedAt: 'asc' },
    });
    const legacySubjects = new Set(
      subscriptions.map(subscription => this.cloudSubjectId(subscription))
    );
    const legacySubscriptionPlans = new Set(
      subscriptions.map(subscription => subscription.plan)
    );

    for (const subscription of subscriptions) {
      const before = await this.findBySubject(
        'cloud_subscription',
        this.cloudSubjectId(subscription)
      );
      const entitlement = await this.upsertFromCloudSubscription(subscription, {
        emit: false,
        legacySync: true,
      });
      changed =
        changed ||
        !before ||
        before.targetType !== entitlement.targetType ||
        before.targetId !== entitlement.targetId ||
        before.plan !== entitlement.plan ||
        before.status !== entitlement.status ||
        before.quantity !== entitlement.quantity ||
        before.expiresAt?.getTime() !== entitlement.expiresAt?.getTime() ||
        before.graceUntil?.getTime() !== entitlement.graceUntil?.getTime();
    }

    const staleEntitlements = await this.db.entitlement.findMany({
      where: {
        targetType,
        targetId,
        source: 'cloud_subscription',
        plan: { in: entitlementPlans },
        status: { in: ['active', 'grace'] },
        OR: [
          { metadata: { path: ['legacySync'], equals: true } },
          { metadata: { path: ['legacyProjected'], equals: true } },
        ],
      },
    });
    const staleIds = staleEntitlements
      .filter(
        entitlement =>
          !legacySubjects.has(entitlement.subjectId ?? '') &&
          !legacySubscriptionPlans.has(
            this.legacySubscriptionPlan(entitlement.plan)
          )
      )
      .map(entitlement => entitlement.id);

    if (staleIds.length) {
      await this.db.entitlement.updateMany({
        where: { id: { in: staleIds } },
        data: { status: 'revoked' },
      });
      changed = true;
    }

    return changed;
  }

  private cloudSubjectId(
    input: Pick<
      CloudSubscriptionEntitlementInput,
      'targetId' | 'plan' | 'subscriptionId' | 'stripeSubscriptionId'
    >
  ) {
    return (
      input.stripeSubscriptionId ??
      (typeof input.subscriptionId === 'string'
        ? input.subscriptionId
        : `${input.targetId}:${input.plan}`)
    );
  }

  private legacySubscriptionPlan(plan: string) {
    if (plan === 'pro' || plan === 'lifetime_pro') {
      return SubscriptionPlan.Pro;
    }
    if (plan === 'ai') {
      return SubscriptionPlan.AI;
    }
    if (plan === 'team') {
      return SubscriptionPlan.Team;
    }
    return plan;
  }

  private async revokeCloudSubscriptionByLegacyTarget(input: {
    targetId: string;
    plan: SubscriptionPlan | string;
  }) {
    const targetType = this.targetTypeForPlan(input.plan);
    const plans =
      input.plan === SubscriptionPlan.Pro
        ? ['pro', 'lifetime_pro']
        : [this.entitlementPlan(input.plan, SubscriptionRecurring.Monthly)];
    const entitlements = await this.db.entitlement.findMany({
      where: {
        targetType,
        targetId: input.targetId,
        source: 'cloud_subscription',
        plan: { in: plans },
        status: { in: ['active', 'grace'] },
      },
    });
    if (!entitlements.length) {
      return;
    }

    await this.db.entitlement.updateMany({
      where: { id: { in: entitlements.map(entitlement => entitlement.id) } },
      data: { status: 'revoked' },
    });
    await Promise.all(
      entitlements.map(entitlement => this.emitEntitlementChanged(entitlement))
    );
  }

  private priority(entitlement: { status: string; plan: string }) {
    const statusPriority =
      entitlement.status === 'active'
        ? 200
        : entitlement.status === 'grace'
          ? 100
          : 0;
    const planPriority =
      entitlement.plan === 'team' || entitlement.plan === 'selfhost_team'
        ? 40
        : entitlement.plan === 'lifetime_pro'
          ? 30
          : entitlement.plan === 'pro'
            ? 20
            : entitlement.plan === 'ai'
              ? 10
              : 0;

    return statusPriority + planPriority;
  }

  private validEntitlementWhere(now: Date) {
    return {
      OR: [
        {
          status: 'active',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        { status: 'grace', graceUntil: { gt: now } },
      ],
    };
  }

  private validEntitlementWhereForTarget(
    targetType: TargetType,
    now: Date
  ): Prisma.EntitlementWhereInput {
    if (!env.selfhosted || targetType !== 'workspace') {
      return this.validEntitlementWhere(now);
    }

    return {
      OR: [
        this.validEntitlementWhere(now),
        {
          status: 'active',
          source: 'selfhost_license',
          plan: 'selfhost_team',
          signedPayload: null,
        },
      ],
    };
  }

  private validSelfhostEntitlementWhere(): Prisma.EntitlementWhereInput {
    if (!env.selfhosted) return {};

    return {
      source: 'selfhost_license',
      plan: 'selfhost_team',
      targetType: 'workspace',
    };
  }

  private async verifyRemoteSelfhostLicense(entitlement: Entitlement) {
    const existing = this.remoteSelfhostLicenseVerifications.get(
      entitlement.id
    );
    if (existing) {
      return existing;
    }

    const task = this.doVerifyRemoteSelfhostLicense(entitlement).finally(() => {
      this.remoteSelfhostLicenseVerifications.delete(entitlement.id);
    });
    this.remoteSelfhostLicenseVerifications.set(entitlement.id, task);
    return task;
  }

  private async doVerifyRemoteSelfhostLicense(entitlement: Entitlement) {
    if (
      entitlement.source !== 'selfhost_license' ||
      entitlement.plan !== 'selfhost_team' ||
      entitlement.targetType !== 'workspace' ||
      !entitlement.targetId ||
      !entitlement.subjectId
    ) {
      return null;
    }

    const metadata = entitlement.metadata as {
      validateKey?: string | null;
      variant?: string | null;
    };
    if (!metadata.validateKey) {
      await this.markRemoteSelfhostLicenseNeedsReupload(
        entitlement,
        'Missing remote validation key.'
      );
      return null;
    }
    const cached = this.remoteSelfhostLicenseCache.get(entitlement.id);
    if (
      cached &&
      cached.verifiedUntil > Date.now() &&
      cached.entitlement.expiresAt &&
      cached.entitlement.expiresAt > new Date()
    ) {
      return cached.entitlement;
    }

    const endpoint =
      process.env.AFFINE_PRO_SERVER_ENDPOINT ?? 'https://app.affine.pro';
    const signal = AbortSignal.timeout(REMOTE_SELFHOST_LICENSE_HEALTH_TIMEOUT);
    try {
      const res = await fetch(
        `${endpoint}/api/team/licenses/${entitlement.subjectId}/health`,
        {
          signal,
          headers: {
            'Content-Type': 'application/json',
            'x-validate-key': metadata.validateKey,
          },
        }
      );
      if (!res.ok) {
        if (res.status >= 500) {
          return this.remoteSelfhostFallbackEntitlement(entitlement);
        }

        await this.markRemoteSelfhostLicenseNeedsReupload(
          entitlement,
          `Remote license health check failed: ${res.status}`
        );
        return null;
      }

      const payload = (await res
        .json()
        .catch(() => null)) as RemoteSelfhostLicense | null;
      if (!payload) {
        return this.remoteSelfhostFallbackEntitlement(entitlement);
      }
      const expiresAt = this.remoteSelfhostLicenseExpiresAt(payload.endAt);
      if (
        payload.plan !== SubscriptionPlan.SelfHostedTeam ||
        payload.quantity < 1 ||
        !expiresAt
      ) {
        await this.markRemoteSelfhostLicenseNeedsReupload(
          entitlement,
          'Remote license health payload is invalid.'
        );
        return null;
      }

      const validateKey =
        res.headers.get('x-next-validate-key') ?? metadata.validateKey;
      const [updated] = await Promise.all([
        this.db.entitlement.update({
          where: { id: entitlement.id },
          data: {
            status: 'active',
            quantity: this.normalizedQuantity(payload.quantity),
            metadata: {
              ...metadata,
              recurring: payload.recurring,
              validateKey,
              remoteValidated: true,
              errorCode: null,
              errorMessage: null,
            },
            expiresAt,
            validatedAt: new Date(),
          },
        }),
        this.db.installedLicense
          .updateMany({
            where: { key: entitlement.subjectId },
            data: {
              quantity: this.normalizedQuantity(payload.quantity),
              recurring: payload.recurring,
              validateKey,
              validatedAt: new Date(),
              expiredAt: expiresAt,
            },
          })
          .catch(() => null),
      ]);
      this.event.emit('entitlement.changed', {
        targetType: 'workspace',
        targetId: entitlement.targetId,
      });
      this.remoteSelfhostLicenseCache.set(entitlement.id, {
        entitlement: updated,
        verifiedUntil: Date.now() + REMOTE_SELFHOST_LICENSE_REVALIDATE_INTERVAL,
      });
      return updated;
    } catch {
      return this.remoteSelfhostFallbackEntitlement(entitlement);
    }
  }

  private remoteSelfhostFallbackEntitlement(entitlement: Entitlement) {
    const cached = this.remoteSelfhostLicenseCache.get(entitlement.id);
    if (
      !cached ||
      cached.verifiedUntil <= Date.now() ||
      !cached.entitlement.expiresAt ||
      cached.entitlement.expiresAt <= new Date()
    ) {
      return null;
    }

    return cached.entitlement;
  }

  private remoteSelfhostLicenseExpiresAt(endAt: unknown) {
    const expiresAt = new Date(endAt as string | number | Date);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
      return null;
    }
    return expiresAt;
  }

  private async markRemoteSelfhostLicenseNeedsReupload(
    entitlement: Entitlement,
    reason: string
  ) {
    this.remoteSelfhostLicenseCache.delete(entitlement.id);
    await this.db.entitlement.update({
      where: { id: entitlement.id },
      data: {
        status: 'needs_reupload',
        metadata: {
          ...(entitlement.metadata as Record<string, unknown>),
          errorCode: 'needs_reupload',
          errorMessage: reason,
        },
        validatedAt: new Date(),
      },
    });
    if (entitlement.targetId) {
      this.event.emit('entitlement.changed', {
        targetType: 'workspace',
        targetId: entitlement.targetId,
      });
    }
  }

  private async emitEntitlementChanged(entitlement: Entitlement) {
    if (!entitlement.targetId) {
      return;
    }
    await this.event.emitAsync('entitlement.changed', {
      targetType: entitlement.targetType as TargetType,
      targetId: entitlement.targetId,
    });
  }

  private targetTypeForPlan(plan: SubscriptionPlan | string): TargetType {
    return plan === SubscriptionPlan.Team ? 'workspace' : 'user';
  }

  private entitlementPlan(
    plan: SubscriptionPlan | string,
    recurring: SubscriptionRecurring | string
  ) {
    if (plan === SubscriptionPlan.Pro) {
      return recurring === SubscriptionRecurring.Lifetime
        ? 'lifetime_pro'
        : 'pro';
    }
    if (plan === SubscriptionPlan.SelfHostedTeam) {
      return 'selfhost_team';
    }
    return plan;
  }

  private statusFromSubscription(status: string): EntitlementStatus {
    if (
      status === SubscriptionStatus.Active ||
      status === SubscriptionStatus.Trialing
    ) {
      return 'active';
    }
    if (status === SubscriptionStatus.PastDue) {
      return 'grace';
    }
    if (status === SubscriptionStatus.Canceled) {
      return 'revoked';
    }
    return 'expired';
  }

  private normalizedQuantity(quantity: number | null | undefined) {
    if (!quantity || quantity < 1) {
      return 1;
    }
    return Math.min(quantity, 100000);
  }
}
