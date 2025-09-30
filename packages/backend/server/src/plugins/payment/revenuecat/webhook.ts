import { Injectable, Logger } from '@nestjs/common';
import { IapStore, PrismaClient, Provider } from '@prisma/client';

import { Config, EventBus, OnEvent } from '../../../base';
import { SubscriptionStatus } from '../types';
import { RcEvent } from './controller';
import { resolveProductMapping } from './map';
import { RevenueCatService, Subscription } from './service';

@Injectable()
export class RevenueCatWebhookHandler {
  private readonly logger = new Logger(RevenueCatWebhookHandler.name);

  constructor(
    private readonly rc: RevenueCatService,
    private readonly db: PrismaClient,
    private readonly config: Config,
    private readonly event: EventBus
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

  // Exposed for reuse by reconcile job
  async syncAppUser(appUserId: string, event?: RcEvent) {
    // Pull latest state to be resilient to reorder/duplicate events
    let subscriptions: Awaited<
      ReturnType<RevenueCatService['getSubscriptions']>
    >;
    try {
      subscriptions = await this.rc.getSubscriptions(appUserId);
      if (!subscriptions) return;
    } catch (e) {
      this.logger.error(`Failed to fetch RC subscriber for ${appUserId}`, e);
      return;
    }

    const productOverride = this.config.payment.revenuecat?.productMap;

    for (const sub of subscriptions) {
      const mapping = resolveProductMapping(sub, productOverride);
      // ignore non-whitelisted and non-fallbackable products
      if (!mapping) continue;

      const { status, deleteInstead, canceledAt, iapStore } =
        this.mapStatus(sub);

      const rcExternalRef = this.pickExternalRef(event);

      // Mutual exclusion: skip if Stripe already active for the same plan
      const conflict = await this.db.subscription.findFirst({
        where: {
          targetId: appUserId,
          plan: mapping.plan,
          provider: Provider.stripe,
          status: {
            in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
          },
        },
      });
      if (conflict) {
        this.logger.warn(
          `Skip RC upsert: Stripe active exists. user=${appUserId} plan=${mapping.plan}`
        );
        continue;
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
        continue;
      }

      // Upsert by unique (targetId, plan) for idempotency
      const start = sub.latestPurchaseDate || new Date();
      const end = sub.expirationDate || null;
      const nextBillAt = end; // period end serves as next bill anchor for IAP

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
      } else if (status !== SubscriptionStatus.PastDue) {
        // Do not emit canceled for PastDue (still within retry/grace window)
        this.event.emit('user.subscription.canceled', {
          userId: appUserId,
          plan: mapping.plan,
          recurring: mapping.recurring,
        });
      }
    }
  }

  private pickExternalRef(e?: RcEvent): string | null {
    return (
      (e &&
        (e.original_transaction_id || e.purchase_token || e.transaction_id)) ||
      null
    );
  }

  private mapStatus(sub: Subscription): {
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
      if (sub.isTrial) {
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
}
