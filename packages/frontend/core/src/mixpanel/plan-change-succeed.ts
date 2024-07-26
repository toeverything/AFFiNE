import type { PlanChangeStartedEvent } from './plan-change-started';

/**
 * Subscription plan changed successfully
 */
export type PlanChangeSucceededEvent = Pick<
  PlanChangeStartedEvent,
  'control' | 'type' | 'category'
>;
