// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import * as mixpanel from 'mixpanel-browser';

import type { GeneralMixpanelEvent, MixpanelEvents } from './events';

declare module 'mixpanel-browser' {
  export interface OverridedMixpanel {
    track<
      T extends string,
      P extends (T extends keyof MixpanelEvents
        ? MixpanelEvents[T]
        : Record<string, unknown>) &
        GeneralMixpanelEvent,
    >(
      event_name: T,
      properties?: P
    ): void;
  }
}
