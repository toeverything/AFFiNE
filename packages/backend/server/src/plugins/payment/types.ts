import type { User, Workspace } from '@prisma/client';
import Stripe from 'stripe';

export enum SubscriptionRecurring {
  Monthly = 'monthly',
  Yearly = 'yearly',
  Lifetime = 'lifetime',
}

export enum SubscriptionPlan {
  Free = 'free',
  Pro = 'pro',
  AI = 'ai',
  Team = 'team',
  Enterprise = 'enterprise',
  SelfHosted = 'selfhosted',
  SelfHostedTeam = 'selfhostedteam',
}

export enum SubscriptionVariant {
  EA = 'earlyaccess',
  Onetime = 'onetime',
}

// see https://stripe.com/docs/api/subscriptions/object#subscription_object-status
export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Unpaid = 'unpaid',
  Canceled = 'canceled',
  Incomplete = 'incomplete',
  Paused = 'paused',
  IncompleteExpired = 'incomplete_expired',
  Trialing = 'trialing',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Open = 'open',
  Void = 'void',
  Paid = 'paid',
  Uncollectible = 'uncollectible',
}

export enum CouponType {
  ProEarlyAccessOneYearFree = 'pro_ea_one_year_free',
  AIEarlyAccessOneYearFree = 'ai_ea_one_year_free',
  ProEarlyAccessAIOneYearFree = 'ai_pro_ea_one_year_free',
}

declare global {
  interface Events {
    'user.subscription.activated': {
      userId: User['id'];
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
    };
    'user.subscription.canceled': {
      userId: User['id'];
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
    };

    'workspace.subscription.activated': {
      workspaceId: Workspace['id'];
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      quantity: number;
    };
    'workspace.subscription.canceled': {
      workspaceId: Workspace['id'];
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
    };
    'workspace.subscription.notify': {
      workspaceId: Workspace['id'];
      expirationDate: Date;
      deletionDate: Date;
    };

    'stripe.invoice.created': Stripe.InvoiceCreatedEvent;
    'stripe.invoice.updated': Stripe.InvoiceUpdatedEvent;
    'stripe.invoice.finalization_failed': Stripe.InvoiceFinalizationFailedEvent;
    'stripe.invoice.payment_failed': Stripe.InvoicePaymentFailedEvent;
    'stripe.invoice.paid': Stripe.InvoicePaidEvent;
    'stripe.customer.subscription.created': Stripe.CustomerSubscriptionCreatedEvent;
    'stripe.customer.subscription.updated': Stripe.CustomerSubscriptionUpdatedEvent;
    'stripe.customer.subscription.deleted': Stripe.CustomerSubscriptionDeletedEvent;
  }
}

export interface LookupKey {
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  variant: SubscriptionVariant | null;
}

export interface KnownStripeInvoice {
  /**
   * User in AFFiNE system.
   */
  userId?: string;

  userEmail: string;

  /**
   * The lookup key of the price that the invoice is for.
   */
  lookupKey: LookupKey;

  /**
   * The invoice object from Stripe.
   */
  stripeInvoice: Stripe.Invoice;

  /**
   * The metadata of the subscription related to the invoice.
   */
  metadata: Record<string, string>;
}

export interface KnownStripeSubscription {
  /**
   * User in AFFiNE system.
   */
  userId?: string;

  userEmail: string;

  /**
   * The lookup key of the price that the invoice is for.
   */
  lookupKey: LookupKey;

  /**
   * The subscription object from Stripe.
   */
  stripeSubscription: Stripe.Subscription;

  /**
   * The quantity of the subscription items.
   */
  quantity: number;

  /**
   * The metadata of the subscription.
   */
  metadata: Record<string, string>;
}

export interface KnownStripePrice {
  /**
   * The lookup key of the price.
   */
  lookupKey: LookupKey;

  /**
   * The price object from Stripe.
   */
  price: Stripe.Price;
}

export const DEFAULT_PRICES = new Map([
  // pro
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Monthly}`,
    {
      product: 'AFFiNE Pro',
      price: 799,
    },
  ],
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}`,
    {
      product: 'AFFiNE Pro',
      price: 8100,
    },
  ],
  // only EA for yearly pro
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.EA}`,
    { product: 'AFFiNE Pro', price: 5000 },
  ],
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Lifetime}`,
    {
      product: 'AFFiNE Pro Believer',
      price: 49900,
    },
  ],
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Monthly}_${SubscriptionVariant.Onetime}`,
    { product: 'AFFiNE Pro - One Month', price: 799 },
  ],
  [
    `${SubscriptionPlan.Pro}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.Onetime}`,
    { product: 'AFFiNE Pro - One Year', price: 8100 },
  ],

  // ai
  [
    `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}`,
    { product: 'AFFiNE AI', price: 10680 },
  ],
  // only EA for yearly AI
  [
    `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.EA}`,
    { product: 'AFFiNE AI', price: 9900 },
  ],
  [
    `${SubscriptionPlan.AI}_${SubscriptionRecurring.Yearly}_${SubscriptionVariant.Onetime}`,
    { product: 'AFFiNE AI - One Year', price: 10680 },
  ],

  // team
  [
    `${SubscriptionPlan.Team}_${SubscriptionRecurring.Monthly}`,
    { product: 'AFFiNE Team(per seat)', price: 1200 },
  ],
  [
    `${SubscriptionPlan.Team}_${SubscriptionRecurring.Yearly}`,
    { product: 'AFFiNE Team(per seat)', price: 12000 },
  ],

  // selfhost team
  [
    `${SubscriptionPlan.SelfHostedTeam}_${SubscriptionRecurring.Monthly}`,
    { product: 'AFFiNE Self-hosted Team(per seat)', price: 1200 },
  ],
  [
    `${SubscriptionPlan.SelfHostedTeam}_${SubscriptionRecurring.Yearly}`,
    { product: 'AFFiNE Self-hosted Team(per seat)', price: 12000 },
  ],
]);

// [Plan x Recurring x Variant] make a stripe price lookup key
export function encodeLookupKey({
  plan,
  recurring,
  variant,
}: LookupKey): string {
  const key = `${plan}_${recurring}` + (variant ? `_${variant}` : '');

  if (!DEFAULT_PRICES.has(key)) {
    throw new Error(`Invalid price: ${key}`);
  }

  return key;
}

export function decodeLookupKey(key: string): LookupKey {
  // NOTE(@forehalo):
  //   we have some legacy prices in stripe still in used,
  //   so we give it `pro_monthly_xxx` variant to make it invisible but valid,
  //   and those variant won't be listed in [SubscriptionVariant]
  // if (!DEFAULT_PRICES.has(key)) {
  //   return null;
  // }
  const [plan, recurring, variant] = key.split('_');

  return {
    plan: plan as SubscriptionPlan,
    recurring: recurring as SubscriptionRecurring,
    variant: variant as SubscriptionVariant,
  };
}

export function retriveLookupKeyFromStripePrice(price: Stripe.Price) {
  return price.lookup_key ? decodeLookupKey(price.lookup_key) : null;
}

export function retriveLookupKeyFromStripeSubscription(
  subscription: Stripe.Subscription
) {
  const price = subscription.items.data[0]?.price;

  // there should be and only one item in the subscription
  if (!price) {
    return null;
  }

  return retriveLookupKeyFromStripePrice(price);
}
