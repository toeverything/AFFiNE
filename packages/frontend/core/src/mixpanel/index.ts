import type { PlanChangeStartedEvent } from './plan-change-started';
import type { PlanChangeSucceededEvent } from './plan-change-succeed';

export interface MixpanelEvents {
  PlanChangeStarted: PlanChangeStartedEvent;
  PlanChangeSucceeded: PlanChangeSucceededEvent;
}
