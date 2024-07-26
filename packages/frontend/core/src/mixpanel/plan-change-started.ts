import type { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';

/**
 * Before subscription plan changed
 */
export interface PlanChangeStartedEvent {
  segment: 'settings panel';
  module: 'pricing plan list' | 'billing subscription list';
  control:
    | 'new subscription' // no subscription before
    | 'cancel'
    | 'paying'; // resume: subscribed before
  type: SubscriptionPlan;
  category: SubscriptionRecurring;
}
