import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class EntitlementProjectionChecker {
  constructor(private readonly db: PrismaClient) {}

  async checkEntitlementProjection() {
    const now = new Date();
    const [
      missingEffectiveUserState,
      missingEffectiveWorkspaceState,
      staleEffectiveUserState,
      staleEffectiveWorkspaceState,
      cloudSubscriptionProjectionMissing,
      selfhostLicenseProjectionMissing,
      cloudSubscriptionEntitlementMissing,
      selfhostLicenseEntitlementMissing,
      dirtyLegacyUserFeatures,
      dirtyLegacyWorkspaceFeatures,
      missingUserFeatureProjection,
      missingWorkspaceFeatureProjection,
    ] = await Promise.all([
      this.db.user.count({
        where: { quotaState: null },
      }),
      this.db.workspace.count({
        where: { quotaState: null },
      }),
      this.db.effectiveUserQuotaState.count({
        where: {
          OR: [{ stale: true }, { known: false }, { staleAfter: { lt: now } }],
        },
      }),
      this.db.effectiveWorkspaceQuotaState.count({
        where: {
          OR: [{ stale: true }, { known: false }, { staleAfter: { lt: now } }],
        },
      }),
      this.cloudSubscriptionProjectionMissing(),
      this.selfhostLicenseProjectionMissing(),
      this.cloudSubscriptionEntitlementMissing(),
      this.selfhostLicenseEntitlementMissing(),
      this.dirtyLegacyUserFeatures(),
      this.dirtyLegacyWorkspaceFeatures(),
      this.missingUserFeatureProjection(),
      this.missingWorkspaceFeatureProjection(),
    ]);

    return {
      missingEffectiveUserState,
      missingEffectiveWorkspaceState,
      staleEffectiveUserState,
      staleEffectiveWorkspaceState,
      cloudSubscriptionProjectionMissing,
      selfhostLicenseProjectionMissing,
      cloudSubscriptionEntitlementMissing,
      selfhostLicenseEntitlementMissing,
      dirtyLegacyUserFeatures,
      dirtyLegacyWorkspaceFeatures,
      missingUserFeatureProjection,
      missingWorkspaceFeatureProjection,
    };
  }

  private async cloudSubscriptionProjectionMissing() {
    const legacyKeys = new Set(
      (
        await this.db.subscription.findMany({
          where: {
            status: { in: ['active', 'trialing', 'past_due'] },
          },
          select: { targetId: true, plan: true },
        })
      ).map(subscription => `${subscription.targetId}:${subscription.plan}`)
    );
    const entitlements = await this.validEntitlements({
      source: 'cloud_subscription',
    });

    return entitlements.filter(
      entitlement =>
        entitlement.targetId &&
        !legacyKeys.has(
          `${entitlement.targetId}:${this.subscriptionPlan(entitlement.plan)}`
        )
    ).length;
  }

  private async selfhostLicenseProjectionMissing() {
    const licenseKeys = new Set(
      (
        await this.db.installedLicense.findMany({
          select: { key: true },
        })
      ).map(license => license.key)
    );
    const entitlements = await this.validEntitlements({
      source: 'selfhost_license',
    });

    return entitlements.filter(
      entitlement =>
        entitlement.subjectId && !licenseKeys.has(entitlement.subjectId)
    ).length;
  }

  private async cloudSubscriptionEntitlementMissing() {
    const activeSubscriptions = await this.db.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      select: { targetId: true, plan: true },
    });
    const valid = new Set(
      (
        await this.validEntitlements({
          source: 'cloud_subscription',
        })
      ).map(
        entitlement =>
          `${entitlement.targetId}:${this.subscriptionPlan(entitlement.plan)}`
      )
    );

    return activeSubscriptions.filter(
      subscription =>
        !valid.has(`${subscription.targetId}:${subscription.plan}`)
    ).length;
  }

  private async selfhostLicenseEntitlementMissing() {
    const licenses = await this.db.installedLicense.findMany({
      where: {
        license: { not: null },
      },
      select: { key: true },
    });
    const validKeys = new Set(
      (
        await this.validEntitlements({
          source: 'selfhost_license',
        })
      ).flatMap(entitlement => entitlement.subjectId ?? [])
    );

    return licenses.filter(license => !validKeys.has(license.key)).length;
  }

  private async dirtyLegacyUserFeatures() {
    const rows = await this.db.userFeature.findMany({
      where: {
        activated: true,
        name: {
          in: ['pro_plan_v1', 'lifetime_pro_plan_v1', 'unlimited_copilot'],
        },
      },
      select: {
        userId: true,
        name: true,
      },
    });

    const valid = new Set(
      (
        await this.validEntitlements({
          targetType: 'user',
          plan: { in: ['pro', 'lifetime_pro', 'ai'] },
        })
      ).map(entitlement => `${entitlement.targetId}:${entitlement.plan}`)
    );

    return rows.filter(row => {
      const plan =
        row.name === 'lifetime_pro_plan_v1'
          ? 'lifetime_pro'
          : row.name === 'pro_plan_v1'
            ? 'pro'
            : 'ai';
      return !valid.has(`${row.userId}:${plan}`);
    }).length;
  }

  private async dirtyLegacyWorkspaceFeatures() {
    const rows = await this.db.workspaceFeature.findMany({
      where: {
        activated: true,
        name: 'team_plan_v1',
      },
      select: { workspaceId: true },
    });
    const validWorkspaceIds = new Set(
      (
        await this.validEntitlements({
          targetType: 'workspace',
          plan: { in: ['team', 'selfhost_team'] },
        })
      ).flatMap(entitlement => entitlement.targetId ?? [])
    );

    return rows.filter(row => !validWorkspaceIds.has(row.workspaceId)).length;
  }

  private async missingUserFeatureProjection() {
    const entitlements = await this.validEntitlements({
      targetType: 'user',
      plan: { in: ['pro', 'lifetime_pro', 'ai'] },
    });
    const features = new Set(
      (
        await this.db.userFeature.findMany({
          where: {
            activated: true,
            name: {
              in: ['pro_plan_v1', 'lifetime_pro_plan_v1', 'unlimited_copilot'],
            },
          },
          select: { userId: true, name: true },
        })
      ).map(feature => `${feature.userId}:${feature.name}`)
    );

    return entitlements.filter(entitlement => {
      if (!entitlement.targetId) {
        return false;
      }
      const feature =
        entitlement.plan === 'lifetime_pro'
          ? 'lifetime_pro_plan_v1'
          : entitlement.plan === 'pro'
            ? 'pro_plan_v1'
            : 'unlimited_copilot';
      return !features.has(`${entitlement.targetId}:${feature}`);
    }).length;
  }

  private async missingWorkspaceFeatureProjection() {
    const entitlements = await this.validEntitlements({
      targetType: 'workspace',
      plan: { in: ['team', 'selfhost_team'] },
    });
    const featureWorkspaceIds = new Set(
      (
        await this.db.workspaceFeature.findMany({
          where: {
            activated: true,
            name: 'team_plan_v1',
          },
          select: { workspaceId: true },
        })
      ).map(feature => feature.workspaceId)
    );

    return entitlements.filter(
      entitlement =>
        entitlement.targetId && !featureWorkspaceIds.has(entitlement.targetId)
    ).length;
  }

  private validEntitlements(where: Record<string, unknown>) {
    const now = new Date();
    return this.db.entitlement.findMany({
      where: {
        ...where,
        ...(where.source === 'selfhost_license'
          ? { signedPayload: { not: null } }
          : {}),
        OR: [
          {
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          {
            status: 'grace',
            graceUntil: { gt: now },
          },
        ],
      },
      select: {
        targetId: true,
        subjectId: true,
        plan: true,
      },
    });
  }

  private subscriptionPlan(plan: string) {
    return plan === 'lifetime_pro' ? 'pro' : plan;
  }
}
