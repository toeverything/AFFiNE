import { PrismaClient, UserStripeCustomer } from '@prisma/client';
import Stripe from 'stripe';
import { z } from 'zod';

import { UserNotFound } from '../../../base';
import { ScheduleManager } from '../schedule';
import { StripeFactory } from '../stripe';
import {
  encodeLookupKey,
  KnownStripeInvoice,
  KnownStripePrice,
  KnownStripeSubscription,
  LookupKey,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from '../types';

export interface Subscription {
  stripeSubscriptionId: string | null;
  stripeScheduleId: string | null;
  status: string;
  plan: string;
  recurring: string;
  variant: string | null;
  quantity: number;
  start: Date;
  end: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  nextBillAt: Date | null;
  canceledAt: Date | null;
  // read-only metadata for IAP integration
  provider?: string | null;
  iapStore?: string | null;
}

export interface Invoice {
  stripeInvoiceId: string;
  currency: string;
  amount: number;
  status: string;
  reason: string | null;
  lastPaymentError: string | null;
  link: string | null;
}

export const SubscriptionIdentity = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
});

export const CheckoutParams = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  recurring: z.nativeEnum(SubscriptionRecurring),
  variant: z.nativeEnum(SubscriptionVariant).nullable().optional(),
  coupon: z.string().nullable().optional(),
  quantity: z.number().min(1).nullable().optional(),
  successCallbackLink: z.string(),
});

export abstract class SubscriptionManager {
  protected readonly scheduleManager = new ScheduleManager(this.stripeProvider);
  constructor(
    protected readonly stripeProvider: StripeFactory,
    protected readonly db: PrismaClient
  ) {}

  get stripe() {
    return this.stripeProvider.stripe;
  }

  abstract filterPrices(
    prices: KnownStripePrice[],
    customer?: UserStripeCustomer
  ): KnownStripePrice[] | Promise<KnownStripePrice[]>;

  abstract checkout(
    lookupKey: LookupKey,
    params: z.infer<typeof CheckoutParams>,
    args: any
  ): Promise<Stripe.Checkout.Session>;

  abstract saveStripeSubscription(
    subscription: KnownStripeSubscription
  ): Promise<Subscription>;
  abstract deleteStripeSubscription(
    subscription: KnownStripeSubscription
  ): Promise<void>;

  abstract getActiveSubscription(
    identity: z.infer<typeof SubscriptionIdentity>
  ): Promise<Subscription | null>;

  abstract getSubscription(
    identity: z.infer<typeof SubscriptionIdentity>
  ): Promise<Subscription | null>;

  abstract cancelSubscription(
    subscription: Subscription
  ): Promise<Subscription>;

  abstract resumeSubscription(
    subscription: Subscription
  ): Promise<Subscription>;

  abstract updateSubscriptionRecurring(
    subscription: Subscription,
    recurring: SubscriptionRecurring
  ): Promise<Subscription>;

  abstract saveInvoice(knownInvoice: KnownStripeInvoice): Promise<Invoice>;

  transformSubscription({
    lookupKey,
    stripeSubscription: subscription,
    quantity,
  }: KnownStripeSubscription): Subscription {
    return {
      ...lookupKey,
      stripeScheduleId: subscription.schedule as string | null,
      stripeSubscriptionId: subscription.id,
      quantity,
      status: subscription.status,
      start: new Date(subscription.current_period_start * 1000),
      end: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      nextBillAt: !subscription.canceled_at
        ? new Date(subscription.current_period_end * 1000)
        : null,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    };
  }

  async transformInvoice({
    stripeInvoice,
  }: KnownStripeInvoice): Promise<Invoice> {
    const status = stripeInvoice.status ?? 'void';
    let error: string | boolean | null = null;

    if (status !== 'paid') {
      if (stripeInvoice.last_finalization_error) {
        error = stripeInvoice.last_finalization_error.message ?? true;
      } else if (
        stripeInvoice.attempt_count > 1 &&
        stripeInvoice.payment_intent
      ) {
        const paymentIntent =
          typeof stripeInvoice.payment_intent === 'string'
            ? await this.stripe.paymentIntents.retrieve(
                stripeInvoice.payment_intent
              )
            : stripeInvoice.payment_intent;

        if (paymentIntent.last_payment_error) {
          error = paymentIntent.last_payment_error.message ?? true;
        }
      }
    }

    // fallback to generic error message
    if (error === true) {
      error = 'Payment Error. Please contact support.';
    }

    return {
      stripeInvoiceId: stripeInvoice.id,
      status,
      link: stripeInvoice.hosted_invoice_url || null,
      reason: stripeInvoice.billing_reason,
      amount: stripeInvoice.total,
      currency: stripeInvoice.currency,
      lastPaymentError: error,
    };
  }

  async getOrCreateCustomer(userId: string): Promise<UserStripeCustomer> {
    const user = await this.db.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
        userStripeCustomer: true,
      },
    });

    if (!user) {
      throw new UserNotFound();
    }

    let customer = user.userStripeCustomer;
    if (!customer) {
      const stripeCustomersList = await this.stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      let stripeCustomer: Stripe.Customer | undefined;
      if (stripeCustomersList.data.length) {
        stripeCustomer = stripeCustomersList.data[0];
      } else {
        stripeCustomer = await this.stripe.customers.create({
          email: user.email,
        });
      }

      customer = await this.db.userStripeCustomer.create({
        data: {
          userId,
          stripeCustomerId: stripeCustomer.id,
        },
      });
    }

    return customer;
  }

  async getPrice(lookupKey: LookupKey): Promise<KnownStripePrice | null> {
    const prices = await this.stripe.prices.list({
      lookup_keys: [encodeLookupKey(lookupKey)],
      limit: 1,
    });

    const price = prices.data[0];

    return price
      ? {
          lookupKey,
          price,
        }
      : null;
  }

  protected async getCouponFromPromotionCode(
    userFacingPromotionCode: string,
    customer?: UserStripeCustomer
  ) {
    const list = await this.stripe.promotionCodes.list({
      code: userFacingPromotionCode,
      active: true,
      limit: 1,
    });

    const code = list.data[0];
    if (!code) {
      return null;
    }

    // the coupons are always bound to products, we need to check it first
    // but the logic would be too complicated, and stripe will complain if the code is not applicable when checking out
    // It's safe to skip the check here
    // code.coupon.applies_to.products.forEach()

    // check if the code is bound to a specific customer
    if (code.customer) {
      if (!customer) {
        return null;
      }

      return (
        typeof code.customer === 'string'
          ? code.customer === customer.stripeCustomerId
          : code.customer.id === customer.stripeCustomerId
      )
        ? code.coupon.id
        : null;
    }

    return code.coupon.id;
  }
}
