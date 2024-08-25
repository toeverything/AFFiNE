import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { EventPayload } from '../../fundamentals';
import { OnEvent, PrismaTransaction } from '../../fundamentals';
import { FeatureManagementService } from '../features/management';
import { FeatureKind } from '../features/types';
import { QuotaConfig } from './quota';
import { QuotaType } from './types';

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly feature: FeatureManagementService
  ) {}

  // get activated user quota
  async getUserQuota(userId: string) {
    const quota = await this.prisma.userFeature.findFirst({
      where: {
        userId,
        feature: {
          type: FeatureKind.Quota,
        },
        activated: true,
      },
      select: {
        reason: true,
        createdAt: true,
        expiredAt: true,
        featureId: true,
      },
    });

    if (!quota) {
      // this should unreachable
      throw new Error(`User ${userId} has no quota`);
    }

    const feature = await QuotaConfig.get(this.prisma, quota.featureId);
    return { ...quota, feature };
  }

  // get user all quota records
  async getUserQuotas(userId: string) {
    const quotas = await this.prisma.userFeature.findMany({
      where: {
        userId,
        feature: {
          type: FeatureKind.Quota,
        },
      },
      select: {
        activated: true,
        reason: true,
        createdAt: true,
        expiredAt: true,
        featureId: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
    const configs = await Promise.all(
      quotas.map(async quota => {
        try {
          return {
            ...quota,
            feature: await QuotaConfig.get(this.prisma, quota.featureId),
          };
        } catch {}
        return null as unknown as typeof quota & {
          feature: QuotaConfig;
        };
      })
    );

    return configs.filter(quota => !!quota);
  }

  // switch user to a new quota
  // currently each user can only have one quota
  async switchUserQuota(
    userId: string,
    quota: QuotaType,
    reason?: string,
    expiredAt?: Date
  ) {
    await this.prisma.$transaction(async tx => {
      const hasSameActivatedQuota = await this.hasQuota(userId, quota, tx);

      if (hasSameActivatedQuota) {
        // don't need to switch
        return;
      }

      const featureId = await tx.feature
        .findFirst({
          where: { feature: quota, type: FeatureKind.Quota },
          select: { id: true },
          orderBy: { version: 'desc' },
        })
        .then(f => f?.id);

      if (!featureId) {
        throw new Error(`Quota ${quota} not found`);
      }

      // we will deactivate all exists quota for this user
      await tx.userFeature.updateMany({
        where: {
          id: undefined,
          userId,
          feature: {
            type: FeatureKind.Quota,
          },
        },
        data: {
          activated: false,
        },
      });

      await tx.userFeature.create({
        data: {
          userId,
          featureId,
          reason: reason ?? 'switch quota',
          activated: true,
          expiredAt,
        },
      });
    });
  }

  async hasQuota(userId: string, quota: QuotaType, tx?: PrismaTransaction) {
    const executor = tx ?? this.prisma;

    return executor.userFeature
      .count({
        where: {
          userId,
          feature: {
            feature: quota,
            type: FeatureKind.Quota,
          },
          activated: true,
        },
      })
      .then(count => count > 0);
  }

  @OnEvent('user.subscription.activated')
  async onSubscriptionUpdated({
    userId,
    plan,
    recurring,
  }: EventPayload<'user.subscription.activated'>) {
    switch (plan) {
      case 'ai':
        await this.feature.addCopilot(userId, 'subscription activated');
        break;
      case 'pro':
        await this.switchUserQuota(
          userId,
          recurring === 'lifetime'
            ? QuotaType.LifetimeProPlanV1
            : QuotaType.ProPlanV1,
          'subscription activated'
        );
        break;
      default:
        break;
    }
  }

  @OnEvent('user.subscription.canceled')
  async onSubscriptionCanceled({
    userId,
    plan,
  }: EventPayload<'user.subscription.canceled'>) {
    switch (plan) {
      case 'ai':
        await this.feature.removeCopilot(userId);
        break;
      case 'pro': {
        // edge case: when user switch from recurring Pro plan to `Lifetime` plan,
        // a subscription canceled event will be triggered because `Lifetime` plan is not subscription based
        const quota = await this.getUserQuota(userId);
        if (quota.feature.name !== QuotaType.LifetimeProPlanV1) {
          await this.switchUserQuota(
            userId,
            QuotaType.FreePlanV1,
            'subscription canceled'
          );
        }
        break;
      }
      default:
        break;
    }
  }
}
