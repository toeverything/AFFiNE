import type { User } from '@prisma/client';

import type { Payload } from '../../fundamentals/event/def';

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

declare module '../../fundamentals/event/def' {
  interface UserEvents {
    subscription: {
      activated: Payload<{
        userId: User['id'];
        plan: SubscriptionPlan;
        recurring: SubscriptionRecurring;
      }>;
      canceled: Payload<{
        userId: User['id'];
        plan: SubscriptionPlan;
        recurring: SubscriptionRecurring;
      }>;
    };
  }
}
