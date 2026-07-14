import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IapStore, PrismaClient, Provider } from '@prisma/client';

import {
  Config,
  EventBus,
  JOB_SIGNAL,
  JobQueue,
  OneMinute,
  OnEvent,
  OnJob,
  sleep,
} from '../../../base';
import { EntitlementService } from '../../../core/entitlement';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';
import { RcEvent } from './controller';
import { resolveProductMapping } from './map';
import { RevenueCatService, Subscription } from './service';

const REFRESH_INTERVAL = 5 * 1000; // 5 seconds
const REFRESH_MAX_TIMES = 10 * OneMinute;

function isLegacyIdentityPlaceholder(metadata: Prisma.JsonValue) {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    metadata.legacyRevenueCatIdentityIncomplete === true
  );
}

@Injectable()
export class RevenueCatWebhookHandler {
  private readonly logger = new Logger(RevenueCatWebhookHandler.name);

  constructor(
    private readonly rc: RevenueCatService,
    private readonly db: PrismaClient,
    private readonly config: Config,
    private readonly event: EventBus,
    private readonly queue: JobQueue,
    private readonly entitlement: EntitlementService
  ) {}

  @OnEvent('revenuecat.webhook')
  async onWebhook(evt: { appUserId?: string; event: RcEvent }) {
    if (!this.config.payment.revenuecat?.enabled) return;

    const appUserId = evt.appUserId;
    if (!appUserId) {
      this.logger.warn('RevenueCat webhook missing appUserId');
      return;
    }
    await this.syncAppUser(appUserId, evt.event);
  }

  // NOTE: add subscription to user before the subscription event is received
  // will expire after a short duration if not confirmed by webhook
  async syncAppUserWithExternalRef(appUserId: string, externalRef: string) {
    // Pull latest state to be resilient to reorder/duplicate events
    let subscriptions: Awaited<
      ReturnType<RevenueCatService['getSubscriptions']>
    >;
    try {
      subscriptions = await this.rc.getSubscriptionByExternalRef(externalRef);
      if (!subscriptions) {
        throw new Error(`No transaction found: ${externalRef}`);
      }
    } catch (e) {
      this.logger.error(
        `Failed to fetch RC subscriptions for ${appUserId} by ${externalRef}`,
        e
      );
      return false;
    }

    const success = await this.syncSubscription(
      appUserId,
      subscriptions,
      undefined,
      externalRef,
      new Date(Date.now() + 10 * OneMinute) // expire after 10 minutes
    );
    this.logger.log('Sync subscription by externalRef completed', {
      appUserId,
      externalRef,
      subscriptions: subscriptions.map(s => s.identifier),
    });
    await this.queue.add('nightly.revenuecat.subscription.refresh', {
      userId: appUserId,
      externalRef: externalRef,
      startTime: Date.now(),
    });

    return success;
  }

  // Exposed for reuse by reconcile job
  async syncAppUser(appUserId: string, event?: RcEvent): Promise<boolean> {
    // Pull latest state to be resilient to reorder/duplicate events
    let subscriptions: Awaited<
      ReturnType<RevenueCatService['getSubscriptions']>
    >;
    try {
      subscriptions = await this.rc.getSubscriptions(appUserId);
      if (!subscriptions) return false;
    } catch (e) {
      this.logger.error(`Failed to fetch RC subscription for ${appUserId}`, e);
      return false;
    }

    return await this.syncSubscription(appUserId, subscriptions, event);
  }

  private async syncSubscription(
    appUserId: string,
    subscriptions: Subscription[],
    event?: RcEvent,
    externalRef?: string,
    overrideExpirationDate?: Date
  ): Promise<boolean> {
    const toBeCleanup = await this.db.providerSubscription.findMany({
      where: {
        provider: Provider.revenuecat,
        targetType: 'user',
        targetId: appUserId,
      },
    });
    const productOverride = this.config.payment.revenuecat?.productMap;
    const removeExists = (id: string) => {
      const index = toBeCleanup.findIndex(
        subscription => subscription.id === id
      );
      if (index >= 0) {
        toBeCleanup.splice(index, 1);
      }
    };

    let success = 0;
    for (const sub of subscriptions) {
      if (!sub.customerId) {
        this.logger.warn(`RevenueCat subscription missing customerId`, {
          subscription: sub,
        });
        continue;
      }
      const customerAlias = await this.rc.getCustomerAlias(sub.customerId);
      if (customerAlias && !customerAlias.includes(appUserId)) {
        this.logger.warn(`RevenueCat subscription customer alias mismatch`, {
          customerId: sub.customerId,
          customerAlias,
          appUserId,
        });
        continue;
      }
      const mapping = resolveProductMapping(sub, productOverride);
      // ignore non-whitelisted and non-fallbackable products
      if (!mapping) continue;

      const { status, deleteInstead, canceledAt, iapStore } = this.mapStatus(
        sub,
        overrideExpirationDate
      );

      const rcExternalRef =
        externalRef || sub.externalRef || this.pickExternalRef(event);
      if (!rcExternalRef || !iapStore) {
        this.logger.warn('RevenueCat subscription missing external identity', {
          subscription: sub,
        });
        continue;
      }
      const start = sub.latestPurchaseDate || new Date();
      const end = overrideExpirationDate || sub.expirationDate || null;
      const matched = await this.db.providerSubscription.findFirst({
        where: {
          provider: Provider.revenuecat,
          iapStore,
          externalRef: rcExternalRef,
          externalProductId: sub.productId,
          externalCustomerId: sub.customerId,
        },
      });
      const existing =
        matched ??
        toBeCleanup.find(
          subscription =>
            subscription.plan === mapping.plan &&
            isLegacyIdentityPlaceholder(subscription.metadata)
        );
      const data = {
        targetType: 'user',
        targetId: appUserId,
        plan: mapping.plan,
        recurring: mapping.recurring,
        status,
        quantity: 1,
        externalCustomerId: sub.customerId,
        externalProductId: sub.productId,
        iapStore,
        externalRef: rcExternalRef,
        periodStart: start,
        periodEnd: end,
        trialStart: sub.isTrial ? start : null,
        trialEnd: sub.isTrial ? end : null,
        canceledAt: canceledAt ?? null,
        metadata: {
          entitlement: sub.identifier,
          isTrial: sub.isTrial,
          willRenew: sub.willRenew,
        },
      };
      const saved = existing
        ? await this.db.providerSubscription.update({
            where: { id: existing.id },
            data,
          })
        : await this.db.providerSubscription.upsert({
            where: {
              provider_iapStore_externalRef_externalProductId_externalCustomerId:
                {
                  provider: Provider.revenuecat,
                  iapStore,
                  externalRef: rcExternalRef,
                  externalProductId: sub.productId,
                  externalCustomerId: sub.customerId,
                },
            },
            update: data,
            create: {
              provider: Provider.revenuecat,
              ...data,
            },
          });
      removeExists(saved.id);

      if (mapping.plan === SubscriptionPlan.AI && sub.isTrial) {
        await this.db.subscriptionTrialUsage.upsert({
          where: {
            targetType_targetId_plan: {
              targetType: 'user',
              targetId: appUserId,
              plan: SubscriptionPlan.AI,
            },
          },
          update: {},
          create: {
            targetType: 'user',
            targetId: appUserId,
            plan: SubscriptionPlan.AI,
            provider: Provider.revenuecat,
            externalRef: rcExternalRef,
            firstUsedAt: start,
            metadata: {
              entitlement: sub.identifier,
              productId: sub.productId,
            },
          },
        });
      }

      // Mutual exclusion: skip if Stripe already active for the same plan
      const conflicts = await this.db.providerSubscription.findMany({
        where: {
          id: { not: saved.id },
          targetType: 'user',
          targetId: appUserId,
          plan: mapping.plan,
          status: {
            in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
          },
        },
      });
      const conflict = conflicts.find(
        subscription => !isLegacyIdentityPlaceholder(subscription.metadata)
      );
      if (conflict) {
        await this.entitlement.revokeCloudSubscription({
          targetId: appUserId,
          plan: mapping.plan,
          subscriptionId: saved.id,
        });
        if (conflict.provider === Provider.stripe) {
          this.logger.warn(
            `Skip RC upsert: Stripe active exists. user=${appUserId} plan=${mapping.plan}`
          );
          continue;
        } else if (conflict.periodEnd && end && conflict.periodEnd > end) {
          this.logger.warn(
            `Skip RC upsert: newer subscription exists. user=${appUserId} plan=${mapping.plan}`
          );
          continue;
        }
      }

      if (deleteInstead) {
        await this.entitlement.revokeCloudSubscription({
          targetId: appUserId,
          plan: mapping.plan,
          subscriptionId: saved.id,
        });
        if (existing && existing.status !== SubscriptionStatus.Canceled) {
          this.event.emit('user.subscription.canceled', {
            userId: appUserId,
            plan: mapping.plan,
            recurring: mapping.recurring,
          });
        }
        continue;
      }

      await this.entitlement.upsertFromCloudSubscription({
        targetId: saved.targetId,
        plan: saved.plan,
        recurring: saved.recurring ?? mapping.recurring,
        status: saved.status,
        quantity: saved.quantity,
        provider: saved.provider,
        subscriptionId: saved.id,
        start: saved.periodStart,
        end: saved.periodEnd,
        trialStart: saved.trialStart,
        trialEnd: saved.trialEnd,
        canceledAt: saved.canceledAt,
      });
      if (existing && existing.targetId !== saved.targetId) {
        this.event.emit('entitlement.changed', {
          targetType: 'user',
          targetId: existing.targetId,
        });
        this.event.emit('user.subscription.canceled', {
          userId: existing.targetId,
          plan: existing.plan as SubscriptionPlan,
          recurring: existing.recurring as SubscriptionRecurring,
        });
      }

      if (
        status === SubscriptionStatus.Active ||
        status === SubscriptionStatus.Trialing
      ) {
        if (
          existing?.status !== SubscriptionStatus.Active &&
          existing?.status !== SubscriptionStatus.Trialing
        ) {
          this.event.emit('user.subscription.activated', {
            userId: appUserId,
            plan: mapping.plan,
            recurring: mapping.recurring,
          });
        }
        success += 1;
      } else if (
        status !== SubscriptionStatus.PastDue &&
        existing?.status !== status
      ) {
        // Do not emit canceled for PastDue (still within retry/grace window)
        this.event.emit('user.subscription.canceled', {
          userId: appUserId,
          plan: mapping.plan,
          recurring: mapping.recurring,
        });
      }
    }

    if (toBeCleanup.length) {
      for (const sub of toBeCleanup) {
        await this.entitlement.revokeCloudSubscription({
          targetId: appUserId,
          plan: sub.plan as SubscriptionPlan,
          subscriptionId: sub.id,
        });
        await this.db.providerSubscription.delete({ where: { id: sub.id } });
        if (!isLegacyIdentityPlaceholder(sub.metadata)) {
          this.event.emit('user.subscription.canceled', {
            userId: appUserId,
            plan: sub.plan as SubscriptionPlan,
            recurring: sub.recurring as SubscriptionRecurring,
          });
        }
      }
      this.logger.log(
        `Cleanup ${toBeCleanup.length} subscriptions for ${appUserId}`,
        {
          appUserId,
          subscriptions: toBeCleanup.map(s => ({
            plan: s.plan,
            recurring: s.recurring,
            end: s.periodEnd,
          })),
        }
      );
    }

    return success > 0;
  }

  private pickExternalRef(e?: RcEvent): string | null {
    return (
      (e &&
        (e.original_transaction_id || e.purchase_token || e.transaction_id)) ||
      null
    );
  }

  private mapStatus(
    sub: Subscription,
    overrideExpirationDate?: Date
  ): {
    status: SubscriptionStatus;
    iapStore: IapStore | null;
    deleteInstead: boolean;
    canceledAt?: Date | null;
  } {
    const now = Date.now();
    const exp = sub.expirationDate?.getTime();

    // Determine iap store and external reference for observability
    const iapStore = ['app_store', 'mac_app_store'].includes(sub.store)
      ? IapStore.app_store
      : ['play_store'].includes(sub.store)
        ? IapStore.play_store
        : null;

    if (sub.isActive) {
      if (sub.isTrial || overrideExpirationDate) {
        return {
          iapStore,
          status: SubscriptionStatus.Trialing,
          deleteInstead: false,
          canceledAt: null,
        };
      }
      // PastDue from subscriber is not directly indicated; treat active as Active
      const canceledAt = sub.willRenew === false ? new Date() : null;
      return {
        iapStore,
        status: SubscriptionStatus.Active,
        deleteInstead: false,
        canceledAt,
      };
    }

    // inactive: if not expired yet (grace/pastdue), keep as PastDue; otherwise delete
    if (exp && exp > now) {
      return {
        iapStore,
        status: SubscriptionStatus.PastDue,
        deleteInstead: false,
        canceledAt: null,
      };
    }

    return {
      iapStore,
      status: SubscriptionStatus.Canceled,
      deleteInstead: true,
    };
  }

  @OnJob('nightly.revenuecat.subscription.refresh.anonymous')
  async onSubscriptionRefreshAnonymousUser(
    evt: Jobs['nightly.revenuecat.subscription.refresh.anonymous']
  ) {
    if (!this.config.payment.revenuecat?.enabled) return;
    if (Date.now() - evt.startTime > REFRESH_MAX_TIMES) {
      this.logger.warn(
        `RevenueCat subscription refresh timed out for externalRef ${evt.externalRef}`
      );
      return;
    }
    const startTime = Date.now();
    try {
      const subscriptions = await this.rc.getSubscriptionByExternalRef(
        evt.externalRef
      );
      let success = 0;
      if (subscriptions) {
        for (const sub of subscriptions) {
          if (!sub.customerId) {
            this.logger.warn(`RevenueCat subscription missing customerId`, {
              subscription: sub,
            });
            continue;
          }
          const customerAlias = await this.rc.getCustomerAlias(sub.customerId);
          if (customerAlias) {
            if (
              customerAlias.length === 0 ||
              customerAlias.length > 1 ||
              !customerAlias[0]
            ) {
              this.logger.warn(
                `RevenueCat anonymous subscription has invalid customer alias`,
                { customerId: sub.customerId, customerAlias }
              );
              continue;
            }
            const appUserId = customerAlias[0];
            const saved = await this.syncSubscription(
              appUserId,
              [sub],
              undefined,
              evt.externalRef
            );
            if (saved) success += 1;
          }
        }
      }
      if (success > 0) return;
    } catch (e) {
      this.logger.error(
        `Failed to fetch RC anonymous subscriptions by ${evt.externalRef}`,
        e
      );
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed < REFRESH_INTERVAL) {
      await sleep(REFRESH_INTERVAL - elapsed);
    }
    return JOB_SIGNAL.Retry;
  }

  @OnJob('nightly.revenuecat.subscription.refresh')
  async onSubscriptionRefresh(
    evt: Jobs['nightly.revenuecat.subscription.refresh']
  ) {
    if (!this.config.payment.revenuecat?.enabled) return;
    const isTimeout = Date.now() - evt.startTime > REFRESH_MAX_TIMES;

    const startTime = Date.now();
    if (isTimeout) {
      const subs = await this.rc.getSubscriptionByExternalRef(evt.externalRef);
      const customers = Array.from(
        new Set(
          (subs?.map(sub => sub.customerId).filter(Boolean) as string[]) || []
        )
      );
      const customerAliases = await Promise.all(
        customers.map(custId =>
          this.rc
            .getCustomerAlias(custId, false)
            .then(aliases =>
              aliases?.length &&
              aliases.filter(a => !a.startsWith('$RCAnonymousID:')).length === 0
                ? aliases[0]
                : null
            )
        )
      );
      for (const oldUserId of customerAliases) {
        if (oldUserId) {
          await this.rc.identifyUser(oldUserId, evt.userId);
        }
      }
    }
    const success = await this.syncAppUser(evt.userId);
    if (success) return;
    if (isTimeout) {
      this.logger.warn(`RevenueCat subscription refresh timed out`, {
        userId: evt.userId,
        externalRef: evt.externalRef,
      });
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed < REFRESH_INTERVAL) {
      await sleep(REFRESH_INTERVAL - elapsed);
    }
    return JOB_SIGNAL.Retry;
  }
}
