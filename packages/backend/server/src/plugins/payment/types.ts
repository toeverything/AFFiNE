import { type User } from '@prisma/client';
import { type Stripe } from 'stripe';

import type { Payload } from '../../fundamentals/event/def';

export interface PaymentConfig {
  stripe: {
    keys: {
      APIKey: string;
      webhookKey: string;
    };
  } & Stripe.StripeConfig;
}

export enum SubscriptionRecurring {
  Monthly = 'monthly',
  Yearly = 'yearly',
}

export enum SubscriptionPlan {
  Free = 'free',
  Pro = 'pro',
  Team = 'team',
  Enterprise = 'enterprise',
  SelfHosted = 'selfhosted',
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

declare module '../../fundamentals/event/def' {
  interface UserEvents {
    subscription: {
      activated: Payload<{
        userId: User['id'];
        plan: SubscriptionPlan;
      }>;
      canceled: Payload<User['id']>;
    };
  }
}
