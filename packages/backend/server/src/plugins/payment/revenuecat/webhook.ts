import { Injectable, Logger } from '@nestjs/common';
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
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';
import { RcEvent } from './controller';
import { ProductMapping, resolveProductMapping } from './map';
import { RevenueCatService, Subscription } from './service';

const REFRESH_INTERVAL = 5 * 1000; // 5 seconds
const REFRESH_MAX_TIMES = 10 * OneMinute;

@Injectable()
export class RevenueCatWebhookHandler {
  private readonly logger = new Logger(RevenueCatWebhookHandler.name);

  constructor(
    private readonly rc: RevenueCatService,
    private readonly db: PrismaClient,
    private readonly config: Config,
    private readonly event: EventBus,
    private readonly queue: JobQueue
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
    const cond = { targetId: appUserId, provider: Provider.revenuecat };
    const toBeCleanup = await this.db.subscription.findMany({
      where: cond,
    });
    const productOverride = this.config.payment.revenuecat?.productMap;
    const removeExists = (mapping: ProductMapping, sub: Subscription) => {
      // Remove from cleanup list
      const index = toBeCleanup.findIndex(s => {
        return (
          s.targetId === appUserId &&
          s.rcProductId === sub.productId &&
          s.plan === mapping.plan
        );
      });
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

      const rcExternalRef = externalRef || this.pickExternalRef(event);
      // Upsert by unique (targetId, plan) for idempotency
      const start = sub.latestPurchaseDate || new Date();
      const end = overrideExpirationDate || sub.expirationDate || null;
      const nextBillAt = end; // period end serves as next bill anchor for IAP

      // Mutual exclusion: skip if Stripe already active for the same plan
      const conflict = await this.db.subscription.findFirst({
        where: {
          targetId: appUserId,
          plan: mapping.plan,
          status: {
            in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
          },
        },
      });
      if (conflict) {
        if (conflict.provider === Provider.stripe) {
          this.logger.warn(
            `Skip RC upsert: Stripe active exists. user=${appUserId} plan=${mapping.plan}`
          );
          continue;
        } else if (conflict.end && end && conflict.end > end) {
          this.logger.warn(
            `Skip RC upsert: newer subscription exists. user=${appUserId} plan=${mapping.plan}`
          );
          continue;
        }
      }

      if (deleteInstead) {
        // delete record and emit cancellation if any record removed
        const result = await this.db.subscription.deleteMany({
          where: {
            targetId: appUserId,
            plan: mapping.plan,
            provider: Provider.revenuecat,
          },
        });
        if (result.count > 0) {
          this.event.emit('user.subscription.canceled', {
            userId: appUserId,
            plan: mapping.plan,
            recurring: mapping.recurring,
          });
        }
        removeExists(mapping, sub);
        continue;
      }

      await this.db.subscription.upsert({
        where: {
          targetId_plan: { targetId: appUserId, plan: mapping.plan },
        },
        update: {
          recurring: mapping.recurring,
          variant: null,
          quantity: 1,
          stripeSubscriptionId: null,
          stripeScheduleId: null,
          provider: Provider.revenuecat,
          iapStore: iapStore,
          rcEntitlement: sub.identifier ?? null,
          rcProductId: sub.productId || null,
          rcExternalRef: rcExternalRef,
          status: status,
          start,
          end,
          nextBillAt,
          canceledAt: canceledAt ?? null,
          trialStart: null,
          trialEnd: null,
        },
        create: {
          targetId: appUserId,
          plan: mapping.plan,
          recurring: mapping.recurring,
          variant: null,
          quantity: 1,
          stripeSubscriptionId: null,
          stripeScheduleId: null,
          provider: Provider.revenuecat,
          iapStore: iapStore,
          rcEntitlement: sub.identifier ?? null,
          rcProductId: sub.productId || null,
          rcExternalRef: rcExternalRef,
          status: status,
          start,
          end,
          nextBillAt,
          canceledAt: canceledAt ?? null,
          trialStart: null,
          trialEnd: null,
        },
      });

      if (
        status === SubscriptionStatus.Active ||
        status === SubscriptionStatus.Trialing
      ) {
        this.event.emit('user.subscription.activated', {
          userId: appUserId,
          plan: mapping.plan,
          recurring: mapping.recurring,
        });
        success += 1;
      } else if (status !== SubscriptionStatus.PastDue) {
        // Do not emit canceled for PastDue (still within retry/grace window)
        this.event.emit('user.subscription.canceled', {
          userId: appUserId,
          plan: mapping.plan,
          recurring: mapping.recurring,
        });
      }

      removeExists(mapping, sub);
    }

    if (toBeCleanup.length) {
      for (const sub of toBeCleanup) {
        await this.db.subscription.deleteMany({ where: { id: sub.id } });
        this.event.emit('user.subscription.canceled', {
          userId: appUserId,
          plan: sub.plan as SubscriptionPlan,
          recurring: sub.recurring as SubscriptionRecurring,
        });
      }
      this.logger.log(
        `Cleanup ${toBeCleanup.length} subscriptions for ${appUserId}`,
        {
          appUserId,
          subscriptions: toBeCleanup.map(s => ({
            plan: s.plan,
            recurring: s.recurring,
            end: s.end,
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
