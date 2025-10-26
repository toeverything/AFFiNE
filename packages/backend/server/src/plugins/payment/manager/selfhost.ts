import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PrismaClient, Provider, UserStripeCustomer } from '@prisma/client';
import { omit, pick } from 'lodash-es';
import { z } from 'zod';

import { SubscriptionPlanNotFound, URLHelper } from '../../../base';
import { Mailer } from '../../../core/mail';
import { StripeFactory } from '../stripe';
import {
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '../types';
import {
  CheckoutParams,
  Invoice,
  Subscription,
  SubscriptionManager,
} from './common';

export const SelfhostTeamCheckoutArgs = z.object({
  quantity: z.number(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
    })
    .optional()
    .nullable(),
});

export const SelfhostTeamSubscriptionIdentity = z.object({
  plan: z.literal(SubscriptionPlan.SelfHostedTeam),
  key: z.string(),
});

@Injectable()
export class SelfhostTeamSubscriptionManager extends SubscriptionManager {
  constructor(
    stripeProvider: StripeFactory,
    db: PrismaClient,
    private readonly url: URLHelper,
    private readonly mailer: Mailer
  ) {
    super(stripeProvider, db);
  }

  filterPrices(
    prices: KnownStripePrice[],
    _customer?: UserStripeCustomer
  ): KnownStripePrice[] {
    return prices.filter(
      price => price.lookupKey.plan === SubscriptionPlan.SelfHostedTeam
    );
  }

  async checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    args: z.infer<typeof SelfhostTeamCheckoutArgs>
  ) {
    const { quantity } = args;

    const price = await this.getPrice(lookupKey);

    if (!price) {
      throw new SubscriptionPlanNotFound({
        plan: lookupKey.plan,
        recurring: lookupKey.recurring,
      });
    }

    const discounts = await (async () => {
      if (params.coupon) {
        const couponId = await this.getCouponFromPromotionCode(params.coupon);
        if (couponId) {
          return { discounts: [{ coupon: couponId }] };
        }
      }

      return { allow_promotion_codes: true };
    })();

    let successUrl = this.url.link(params.successCallbackLink);
    // stripe only accept unescaped '{CHECKOUT_SESSION_ID}' as query
    successUrl = this.url.addSimpleQuery(
      successUrl,
      'session_id',
      '{CHECKOUT_SESSION_ID}',
      false
    );

    return this.stripe.checkout.sessions.create({
      line_items: [
        {
          price: price.price.id,
          quantity,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
          },
        },
      ],
      tax_id_collection: {
        enabled: true,
      },
      ...discounts,
      mode: 'subscription',
      success_url: successUrl,
    });
  }

  async saveStripeSubscription(subscription: KnownStripeSubscription) {
    const { stripeSubscription, userEmail } = subscription;

    const subscriptionData = this.transformSubscription(subscription);

    const existingSubscription = await this.db.subscription.findFirst({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    if (!existingSubscription) {
      const key = randomUUID();
      const [subscription] = await this.db.$transaction([
        this.db.subscription.create({
          data: {
            provider: Provider.stripe,
            targetId: key,
            ...omit(subscriptionData, 'provider', 'iapStore'),
          },
        }),
        this.db.license.create({
          data: { key },
        }),
      ]);

      await this.mailer.send({
        name: 'TeamLicense',
        to: userEmail,
        props: { license: key },
      });

      return subscription;
    } else {
      return this.db.subscription.update({
        where: {
          stripeSubscriptionId: stripeSubscription.id,
        },
        data: pick(subscriptionData, [
          'status',
          'stripeScheduleId',
          'nextBillAt',
          'canceledAt',
          'end',
        ]),
      });
    }
  }

  async deleteStripeSubscription({
    stripeSubscription,
  }: KnownStripeSubscription) {
    const subscription = await this.db.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      return;
    }

    await this.db.$transaction([
      this.db.subscription.deleteMany({
        where: { stripeSubscriptionId: stripeSubscription.id },
      }),
      this.db.license.deleteMany({
        where: { key: subscription.targetId },
      }),
    ]);
  }

  getSubscription(identity: z.infer<typeof SelfhostTeamSubscriptionIdentity>) {
    return this.db.subscription.findFirst({
      where: { targetId: identity.key },
    });
  }

  getActiveSubscription(
    identity: z.infer<typeof SelfhostTeamSubscriptionIdentity>
  ) {
    return this.db.subscription.findFirst({
      where: {
        targetId: identity.key,
        plan: identity.plan,
        status: {
          in: [SubscriptionStatus.Active, SubscriptionStatus.Trialing],
        },
      },
    });
  }

  async cancelSubscription(subscription: Subscription) {
    return await this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: new Date(),
        nextBillAt: null,
      },
    });
  }

  resumeSubscription(subscription: Subscription): Promise<Subscription> {
    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: {
        canceledAt: null,
        nextBillAt: subscription.end,
      },
    });
  }

  updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ): Promise<Subscription> {
    return this.db.subscription.update({
      where: {
        // @ts-expect-error checked outside
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      data: { recurring },
    });
  }

  async saveInvoice(knownInvoice: KnownStripeInvoice): Promise<Invoice> {
    const invoiceData = await this.transformInvoice(knownInvoice);

    return invoiceData;
  }
}
