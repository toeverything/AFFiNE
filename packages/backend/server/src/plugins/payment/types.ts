import type { Workspace } from '@prisma/client';

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

declare global {
  interface Events {
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
  }
}
