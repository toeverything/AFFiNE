import { enableAutoTrack, mixpanel, sentry } from '@affine/track';
import { appSettingAtom } from '@toeverything/infra';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';

export function Telemetry() {
  const settings = useAtomValue(appSettingAtom);

  useEffect(() => {
    if (settings.enableTelemetry === true) {
      sentry.enable();
      mixpanel.opt_in_tracking();
      return enableAutoTrack(document.body, mixpanel.track);
    } else {
      sentry.disable();
      mixpanel.opt_out_tracking();
      return;
    }
  }, [settings.enableTelemetry]);

  return null;
}
