import { Injectable } from '@nestjs/common';
import { Entitlement, IapStore, PrismaClient, Provider } from '@prisma/client';

import { OnEvent } from '../../base';
import { Models } from '../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../../plugins/payment/types';
import { EntitlementService } from './service';

type Metadata = {
  provider?: string | null;
  recurring?: string | null;
  variant?: string | null;
  subscriptionId?: string | number | null;
  stripeSubscriptionId?: string | null;
  validateKey?: string | null;
  legacyProjected?: boolean;
};

const BACKFILL_BATCH_SIZE = 1000;

@Injectable()
export class LegacyEntitlementProjectionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly models: Models,
    private readonly entitlement: EntitlementService
  ) {}

  @OnEvent('entitlement.changed')
  async onEntitlementChanged({
    targetType,
    targetId,
  }: Events['entitlement.changed']) {
    if (targetType === 'user') {
      await this.#projectCloudSubscriptions('user', targetId);
      await this.#projectUserFeatures(targetId);
    } else if (targetType === 'workspace') {
      await this.#projectCloudSubscriptions('workspace', targetId);
      await Promise.all([
        this.#projectWorkspaceFeatures(targetId),
        this.#projectInstalledLicense(targetId),
      ]);
    }
  }

  @OnEvent('workspace.quota_state.changed')
  async onWorkspaceQuotaStateChanged({
    workspaceId,
  }: Events['workspace.quota_state.changed']) {
    await this.#projectReadonlyFeature(workspaceId);
  }

  async scanInstalledLicenses(options: { emit?: boolean } = {}) {
    const licenses = await this.db.installedLicense.findMany();
    const emit = options.emit ?? true;

    await Promise.all(
      licenses.map(async license =>
        license.license
          ? await this.entitlement.upsertFromSelfhostLicense(
              {
                workspaceId: license.workspaceId,
                licenseKey: license.key,
                recurring: license.recurring,
                quantity: license.quantity,
                expiresAt: license.expiredAt,
                validatedAt: license.validatedAt,
                license: Buffer.from(license.license),
              },
              { emit }
            )
          : license.validateKey
            ? await this.entitlement.upsertFromValidatedSelfhostLicense(
                {
                  workspaceId: license.workspaceId,
                  licenseKey: license.key,
                  recurring: license.recurring,
                  quantity: license.quantity,
                  expiresAt: license.expiredAt,
                  validatedAt: license.validatedAt,
                  validateKey: license.validateKey,
                  variant: license.variant,
                },
                { emit }
              )
            : await this.entitlement.markSelfhostLicenseNeedsReupload(
                {
                  workspaceId: license.workspaceId,
                  licenseKey: license.key,
                  reason: 'Installed license has no raw payload to verify.',
                },
                { emit }
              )
      )
    );
  }

  async backfillEntitlementsAndQuotaStates() {
    await this.#cleanupDanglingLegacyEntitlements();
    await this.#backfillEntitlementsAndQuotaStates({ cleanupLegacy: true });
  }

  async shadowBackfillEntitlementsAndQuotaStates() {
    await this.#backfillEntitlementsAndQuotaStates({ cleanupLegacy: false });
  }

  async #backfillEntitlementsAndQuotaStates({
    cleanupLegacy,
  }: {
    cleanupLegacy: boolean;
  }) {
    const [subscriptionCount, invoiceCount, installedLicenseCount] =
      await Promise.all([
        this.db.subscription.count(),
        this.db.invoice.count(),
        this.db.installedLicense.count(),
      ]);

    if (
      subscriptionCount === 0 &&
      invoiceCount === 0 &&
      installedLicenseCount === 0
    ) {
      await this.#backfillQuotaStateStaleFlags();
      return;
    }

    const subscriptions = await this.db.subscription.findMany();

    for (const subscription of subscriptions) {
      if (!(await this.#subscriptionTargetExists(subscription))) {
        continue;
      }
      if (subscription.plan === SubscriptionPlan.SelfHostedTeam) {
        await this.entitlement.markSelfhostLicenseNeedsReupload(
          {
            licenseKey: subscription.targetId,
            reason:
              'Historical self-hosted team subscription needs license activation or revalidation.',
          },
          { emit: cleanupLegacy }
        );
        continue;
      }
      await this.entitlement.upsertFromCloudSubscription(subscription, {
        emit: cleanupLegacy,
        legacySync: true,
      });
      await this.#backfillProviderSubscription(subscription);
      if (
        subscription.plan === SubscriptionPlan.AI &&
        (subscription.trialStart || subscription.trialEnd)
      ) {
        await this.#backfillTrialUsage(subscription);
      }
    }

    await this.#backfillPaymentEvents();
    await this.scanInstalledLicenses({ emit: cleanupLegacy });

    await this.#backfillQuotaStateStaleFlags();
  }

  async #backfillQuotaStateStaleFlags() {
    await Promise.all([
      this.db.effectiveUserQuotaState.updateMany({
        data: { stale: true },
      }),
      this.db.effectiveWorkspaceQuotaState.updateMany({
        data: { stale: true },
      }),
    ]);

    await Promise.all([
      this.#createMissingUserQuotaStates(),
      this.#createMissingWorkspaceQuotaStates(),
    ]);
  }

  async #createMissingUserQuotaStates() {
    let lastId: string | undefined;
    while (true) {
      const users = await this.db.user.findMany({
        select: { id: true },
        where: lastId ? { id: { gt: lastId } } : undefined,
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH_SIZE,
      });
      if (!users.length) {
        break;
      }

      await this.db.effectiveUserQuotaState.createMany({
        data: users.map(user => ({
          userId: user.id,
          plan: 'free',
          blobLimit: BigInt(0),
          storageQuota: BigInt(0),
          usedStorageQuota: BigInt(0),
          historyPeriodSeconds: 0,
          known: false,
          stale: true,
        })),
        skipDuplicates: true,
      });

      lastId = users.at(-1)?.id;
    }
  }

  async #createMissingWorkspaceQuotaStates() {
    let lastId: string | undefined;
    while (true) {
      const workspaces = await this.db.workspace.findMany({
        select: { id: true },
        where: lastId ? { id: { gt: lastId } } : undefined,
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH_SIZE,
      });
      if (!workspaces.length) {
        break;
      }

      await this.db.effectiveWorkspaceQuotaState.createMany({
        data: workspaces.map(workspace => ({
          workspaceId: workspace.id,
          plan: 'free',
          usesOwnerQuota: true,
          seatLimit: 0,
          memberCount: 0,
          overcapacityMemberCount: 0,
          blobLimit: BigInt(0),
          storageQuota: BigInt(0),
          usedStorageQuota: BigInt(0),
          historyPeriodSeconds: 0,
          known: false,
          stale: true,
        })),
        skipDuplicates: true,
      });

      lastId = workspaces.at(-1)?.id;
    }
  }

  async #backfillProviderSubscription(subscription: {
    targetId: string;
    plan: string;
    recurring: string;
    status: string;
    provider: Provider | string;
    iapStore?: IapStore | null;
    rcExternalRef?: string | null;
    rcProductId?: string | null;
    stripeSubscriptionId?: string | null;
    quantity: number;
    start: Date;
    end?: Date | null;
    trialStart?: Date | null;
    trialEnd?: Date | null;
    canceledAt?: Date | null;
  }) {
    const targetType =
      subscription.plan === SubscriptionPlan.Team ? 'workspace' : 'user';
    if (
      subscription.provider === 'stripe' &&
      subscription.stripeSubscriptionId
    ) {
      await this.db.providerSubscription.upsert({
        where: {
          provider_externalSubscriptionId: {
            provider: 'stripe',
            externalSubscriptionId: subscription.stripeSubscriptionId,
          },
        },
        update: {
          targetType,
          targetId: subscription.targetId,
          plan: subscription.plan,
          recurring: subscription.recurring,
          status: subscription.status,
          quantity: subscription.quantity,
          periodStart: subscription.start,
          periodEnd: subscription.end,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          canceledAt: subscription.canceledAt,
          metadata: { legacySync: true },
        },
        create: {
          provider: 'stripe',
          targetType,
          targetId: subscription.targetId,
          plan: subscription.plan,
          recurring: subscription.recurring,
          status: subscription.status,
          externalSubscriptionId: subscription.stripeSubscriptionId,
          quantity: subscription.quantity,
          periodStart: subscription.start,
          periodEnd: subscription.end,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          canceledAt: subscription.canceledAt,
          metadata: { legacySync: true },
        },
      });
      return;
    }

    if (
      subscription.provider === 'revenuecat' &&
      subscription.iapStore &&
      subscription.rcExternalRef &&
      subscription.rcProductId
    ) {
      await this.db.providerSubscription.upsert({
        where: {
          provider_iapStore_externalRef_externalProductId_externalCustomerId: {
            provider: 'revenuecat',
            iapStore: subscription.iapStore,
            externalRef: subscription.rcExternalRef,
            externalProductId: subscription.rcProductId,
            externalCustomerId: subscription.targetId,
          },
        },
        update: {
          targetType,
          targetId: subscription.targetId,
          plan: subscription.plan,
          recurring: subscription.recurring,
          status: subscription.status,
          quantity: subscription.quantity,
          periodStart: subscription.start,
          periodEnd: subscription.end,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          canceledAt: subscription.canceledAt,
          metadata: { legacySync: true },
        },
        create: {
          provider: 'revenuecat',
          targetType,
          targetId: subscription.targetId,
          plan: subscription.plan,
          recurring: subscription.recurring,
          status: subscription.status,
          externalCustomerId: subscription.targetId,
          iapStore: subscription.iapStore,
          externalRef: subscription.rcExternalRef,
          externalProductId: subscription.rcProductId,
          quantity: subscription.quantity,
          periodStart: subscription.start,
          periodEnd: subscription.end,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          canceledAt: subscription.canceledAt,
          metadata: { legacySync: true },
        },
      });
    }
  }

  async #backfillTrialUsage(subscription: {
    targetId: string;
    plan: string;
    provider: Provider | string;
    stripeSubscriptionId?: string | null;
    rcExternalRef?: string | null;
    trialStart?: Date | null;
    trialEnd?: Date | null;
    start: Date;
  }) {
    await this.db.subscriptionTrialUsage.upsert({
      where: {
        targetType_targetId_plan: {
          targetType: 'user',
          targetId: subscription.targetId,
          plan: subscription.plan,
        },
      },
      update: {},
      create: {
        targetType: 'user',
        targetId: subscription.targetId,
        plan: subscription.plan,
        provider:
          subscription.provider === 'revenuecat' ? 'revenuecat' : 'stripe',
        externalRef:
          subscription.stripeSubscriptionId ??
          subscription.rcExternalRef ??
          null,
        firstUsedAt:
          subscription.trialStart ??
          subscription.trialEnd ??
          subscription.start,
        metadata: { legacySync: true },
      },
    });
  }

  async #backfillPaymentEvents() {
    const invoices = await this.db.invoice.findMany();

    for (const invoice of invoices) {
      await this.db.paymentEvent.upsert({
        where: {
          provider_externalEventId: {
            provider: 'stripe',
            externalEventId: `stripe_invoice:${invoice.stripeInvoiceId}`,
          },
        },
        update: {
          targetId: invoice.targetId,
          externalInvoiceId: invoice.stripeInvoiceId,
          amount: invoice.amount,
          currency: invoice.currency,
          processingStatus: 'processed',
          processedAt: invoice.updatedAt,
          metadata: {
            legacySync: true,
            status: invoice.status,
            reason: invoice.reason,
          },
        },
        create: {
          provider: 'stripe',
          eventType: 'invoice.backfill',
          externalEventId: `stripe_invoice:${invoice.stripeInvoiceId}`,
          targetId: invoice.targetId,
          externalInvoiceId: invoice.stripeInvoiceId,
          amount: invoice.amount,
          currency: invoice.currency,
          occurredAt: invoice.createdAt,
          processingStatus: 'processed',
          processedAt: invoice.updatedAt,
          metadata: {
            legacySync: true,
            status: invoice.status,
            reason: invoice.reason,
          },
        },
      });
    }
  }

  async #cleanupDanglingLegacyEntitlements() {
    await this.db.$executeRaw`
      DELETE FROM entitlements entitlement
      WHERE (
          entitlement.target_type = 'user'
          AND NOT EXISTS (
            SELECT 1
            FROM users
            WHERE users.id = entitlement.target_id
          )
        )
        OR (
          entitlement.target_type = 'workspace'
          AND NOT EXISTS (
            SELECT 1
            FROM workspaces
            WHERE workspaces.id = entitlement.target_id
          )
        )
    `;

    await this.db.$executeRaw`
      DELETE FROM subscriptions subscription
      WHERE (
          subscription.plan IN (${SubscriptionPlan.Pro}, ${SubscriptionPlan.AI})
          AND NOT EXISTS (
            SELECT 1
            FROM users
            WHERE users.id = subscription.target_id
          )
        )
        OR (
          subscription.plan = ${SubscriptionPlan.Team}
          AND NOT EXISTS (
            SELECT 1
            FROM workspaces
            WHERE workspaces.id = subscription.target_id
          )
        )
    `;
  }

  async #subscriptionTargetExists(subscription: {
    targetId: string;
    plan: string;
  }) {
    if (
      subscription.plan === SubscriptionPlan.Pro ||
      subscription.plan === SubscriptionPlan.AI
    ) {
      return !!(await this.db.user.findUnique({
        where: { id: subscription.targetId },
        select: { id: true },
      }));
    }

    if (subscription.plan === SubscriptionPlan.Team) {
      return !!(await this.db.workspace.findUnique({
        where: { id: subscription.targetId },
        select: { id: true },
      }));
    }

    return true;
  }

  async #projectUserFeatures(userId: string) {
    // TODO(stable-upgrade): contract legacy feature projection after old clients/resolvers are gone.
    const entitlements = await this.#activeEntitlements('user', userId);
    const quotaEntitlement = entitlements.find(entitlement =>
      ['lifetime_pro', 'pro'].includes(entitlement.plan)
    );

    if (quotaEntitlement?.plan === 'lifetime_pro') {
      await this.models.userFeature.switchQuota(
        userId,
        'lifetime_pro_plan_v1',
        'legacy entitlement projection'
      );
    } else if (quotaEntitlement?.plan === 'pro') {
      await this.models.userFeature.switchQuota(
        userId,
        'pro_plan_v1',
        'legacy entitlement projection'
      );
    } else if (
      await this.hasActiveUserFeature(userId, [
        'pro_plan_v1',
        'lifetime_pro_plan_v1',
      ])
    ) {
      await this.models.userFeature.switchQuota(
        userId,
        'free_plan_v1',
        'legacy entitlement projection'
      );
    }

    if (entitlements.some(entitlement => entitlement.plan === 'ai')) {
      await this.models.userFeature.add(
        userId,
        'unlimited_copilot',
        'legacy entitlement projection'
      );
    } else {
      await this.models.userFeature.remove(userId, 'unlimited_copilot');
    }
  }

  async #projectWorkspaceFeatures(workspaceId: string) {
    // TODO(stable-upgrade): contract legacy feature projection after old clients/resolvers are gone.
    const [entitlement, resolved] = await Promise.all([
      this.entitlement.getBestEntitlement('workspace', workspaceId),
      this.entitlement.resolveWorkspaceEntitlement(workspaceId),
    ]);

    if (
      entitlement &&
      ['team', 'selfhost_team'].includes(resolved.plan) &&
      resolved.valid &&
      resolved.quota.seatLimit
    ) {
      await this.models.workspaceFeature.add(
        workspaceId,
        'team_plan_v1',
        'legacy entitlement projection',
        {
          memberLimit: resolved.quota.seatLimit,
        }
      );
    } else {
      await this.models.workspaceFeature.remove(workspaceId, 'team_plan_v1');
    }
  }

  async #projectCloudSubscriptions(
    targetType: 'user' | 'workspace',
    targetId: string
  ) {
    // TODO(stable-upgrade): remove reverse projection after stable no longer depends on old subscriptions.
    if (env.selfhosted) return;
    const entitlements = await this.db.entitlement.findMany({
      where: {
        targetType,
        targetId,
        source: 'cloud_subscription',
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const entitlement of this.#projectableCloudEntitlements(
      entitlements
    )) {
      const metadata = entitlement.metadata as Metadata;
      await this.db.subscription.upsert({
        where: {
          targetId_plan: {
            targetId,
            plan: this.#subscriptionPlan(entitlement.plan),
          },
        },
        update: {
          recurring: metadata.recurring ?? SubscriptionRecurring.Monthly,
          variant: metadata.variant ?? null,
          quantity: entitlement.quantity ?? 1,
          stripeSubscriptionId: metadata.stripeSubscriptionId ?? null,
          provider: this.#provider(metadata.provider),
          status: this.#subscriptionStatus(entitlement.status),
          start: entitlement.startsAt ?? entitlement.createdAt,
          end: entitlement.expiresAt,
          trialEnd: entitlement.graceUntil,
        },
        create: {
          targetId,
          plan: this.#subscriptionPlan(entitlement.plan),
          recurring: metadata.recurring ?? SubscriptionRecurring.Monthly,
          variant: metadata.variant ?? null,
          quantity: entitlement.quantity ?? 1,
          stripeSubscriptionId: metadata.stripeSubscriptionId ?? null,
          provider: this.#provider(metadata.provider),
          status: this.#subscriptionStatus(entitlement.status),
          start: entitlement.startsAt ?? entitlement.createdAt,
          end: entitlement.expiresAt,
          trialEnd: entitlement.graceUntil,
        },
      });
      if (!metadata.legacyProjected) {
        await this.db.entitlement.update({
          where: { id: entitlement.id },
          data: {
            metadata: {
              ...metadata,
              legacyProjected: true,
            },
          },
        });
      }
    }
  }

  *#projectableCloudEntitlements(entitlements: Entitlement[]) {
    const byPlan = new Map<string, Entitlement>();

    for (const entitlement of entitlements) {
      const plan = this.#subscriptionPlan(entitlement.plan);
      const current = byPlan.get(plan);

      if (
        !current ||
        this.#subscriptionProjectionPriority(entitlement) >
          this.#subscriptionProjectionPriority(current)
      ) {
        byPlan.set(plan, entitlement);
      }
    }

    yield* byPlan.values();
  }

  #subscriptionProjectionPriority(entitlement: {
    status: string;
    updatedAt: Date;
  }) {
    const statusPriority =
      entitlement.status === 'active' || entitlement.status === 'grace'
        ? 2
        : entitlement.status === 'expired'
          ? 1
          : 0;

    return (
      statusPriority * 10_000_000_000_000 + entitlement.updatedAt.getTime()
    );
  }

  async #projectInstalledLicense(workspaceId: string) {
    const [entitlements, resolved] = await Promise.all([
      this.db.entitlement.findMany({
        where: {
          targetType: 'workspace',
          targetId: workspaceId,
          source: 'selfhost_license',
        },
        orderBy: [{ signedPayload: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.entitlement.resolveWorkspaceEntitlement(workspaceId),
    ]);
    const entitlement = entitlements.sort(
      (left, right) =>
        this.#installedLicenseStatusPriority(right.status) -
          this.#installedLicenseStatusPriority(left.status) ||
        Number(!!right.signedPayload) - Number(!!left.signedPayload) ||
        right.updatedAt.getTime() - left.updatedAt.getTime()
    )[0];

    if (!entitlement) {
      return;
    }

    if (
      resolved.plan !== 'selfhost_team' ||
      !['active', 'grace', 'expired'].includes(resolved.status)
    ) {
      await this.db.installedLicense.deleteMany({
        where: { workspaceId },
      });
      return;
    }

    const metadata = entitlement.metadata as Metadata;
    const expiredAt = resolved.expiresAt
      ? new Date(resolved.expiresAt)
      : entitlement.expiresAt;
    await this.db.installedLicense.upsert({
      where: { workspaceId },
      update: {
        key: resolved.subjectId ?? entitlement.subjectId ?? entitlement.id,
        quantity: resolved.quantity ?? 1,
        recurring:
          resolved.recurring ??
          metadata.recurring ??
          SubscriptionRecurring.Monthly,
        variant: metadata.variant ?? null,
        validateKey: metadata.validateKey ?? '',
        validatedAt: entitlement.validatedAt ?? new Date(),
        expiredAt,
        license: entitlement.signedPayload
          ? Buffer.from(entitlement.signedPayload)
          : null,
      },
      create: {
        workspaceId,
        key: resolved.subjectId ?? entitlement.subjectId ?? entitlement.id,
        quantity: resolved.quantity ?? 1,
        recurring:
          resolved.recurring ??
          metadata.recurring ??
          SubscriptionRecurring.Monthly,
        variant: metadata.variant ?? null,
        validateKey: metadata.validateKey ?? '',
        validatedAt: entitlement.validatedAt ?? new Date(),
        expiredAt,
        license: entitlement.signedPayload
          ? Buffer.from(entitlement.signedPayload)
          : null,
      },
    });
  }

  #installedLicenseStatusPriority(status: string) {
    if (status === 'active' || status === 'grace') {
      return 3;
    }
    if (status === 'expired') {
      return 2;
    }
    if (status === 'needs_reupload') {
      return 1;
    }
    return 0;
  }

  async #projectReadonlyFeature(workspaceId: string) {
    const state = await this.db.effectiveWorkspaceQuotaState.findUnique({
      where: {
        workspaceId,
      },
    });

    if (state?.readonly) {
      await this.models.workspaceFeature.add(
        workspaceId,
        'quota_exceeded_readonly_workspace_v1',
        `legacy quota state projection: ${state.readonlyReasons.join(',')}`
      );
    } else {
      await this.models.workspaceFeature.remove(
        workspaceId,
        'quota_exceeded_readonly_workspace_v1'
      );
    }
  }

  async #activeEntitlements(
    targetType: 'user' | 'workspace',
    targetId: string
  ) {
    return this.entitlement.getActiveEntitlements(targetType, targetId);
  }

  private async hasActiveUserFeature(userId: string, names: string[]) {
    const count = await this.db.userFeature.count({
      where: {
        userId,
        name: { in: names },
        activated: true,
      },
    });

    return count > 0;
  }

  #subscriptionPlan(plan: string) {
    if (plan === 'lifetime_pro') {
      return SubscriptionPlan.Pro;
    }
    if (plan === 'selfhost_team') {
      return SubscriptionPlan.SelfHostedTeam;
    }
    return plan;
  }

  #subscriptionStatus(status: string) {
    if (status === 'active') {
      return SubscriptionStatus.Active;
    }
    if (status === 'grace') {
      return SubscriptionStatus.PastDue;
    }
    return SubscriptionStatus.Canceled;
  }

  #provider(provider: string | null | undefined) {
    return provider === 'revenuecat' ? 'revenuecat' : 'stripe';
  }
}
