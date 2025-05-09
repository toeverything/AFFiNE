import { mixpanel } from '@affine/track';
import {
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/affine/shared/services';
import type { ExtensionType } from '@blocksuite/affine/store';

export function getTelemetryExtension(): ExtensionType {
  return {
    setup: di => {
      di.addImpl(TelemetryProvider, () => ({
        track: <T extends keyof TelemetryEventMap>(
          eventName: T,
          props: TelemetryEventMap[T]
        ) => {
          mixpanel.track(eventName as string, props as Record<string, unknown>);
        },
      }));
    },
  };
}
