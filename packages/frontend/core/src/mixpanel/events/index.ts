import type { PlanChangeStartedEvent } from './plan-change-started';
import type { PlanChangeSucceededEvent } from './plan-change-succeed';

export interface MixpanelEvents {
  PlanChangeStarted: PlanChangeStartedEvent;
  PlanChangeSucceeded: PlanChangeSucceededEvent;
  OAuth: {
    provider: string;
  };
}

export interface GeneralMixpanelEvent {
  // location
  page?: string | null;
  segment?: string | null;
  module?: string | null;
  control?: string | null;

  // entity
  type?: string | null;
  category?: string | null;
  id?: string | null;
}
