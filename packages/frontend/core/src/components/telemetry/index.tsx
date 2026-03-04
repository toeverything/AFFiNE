import { enableAutoTrack, sentry, tracker } from '@affine/track';
import { appSettingAtom } from '@toeverything/infra';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';

export function Telemetry() {
  const settings = useAtomValue(appSettingAtom);

  useEffect(() => {
    if (settings.enableTelemetry === false) {
      sentry.disable();
      tracker.opt_out_tracking();
      return;
    } else {
      sentry.enable();
      tracker.opt_in_tracking();
      return enableAutoTrack(document.body, tracker.track);
    }
  }, [settings.enableTelemetry]);

  return null;
}
