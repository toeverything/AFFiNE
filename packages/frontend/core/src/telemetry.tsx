import { appSettingAtom } from '@toeverything/infra';
import { useAtomValue } from 'jotai/react';
import { useLayoutEffect } from 'react';

import { enableAutoTrack, mixpanel } from './mixpanel';

export function Telemetry() {
  const settings = useAtomValue(appSettingAtom);
  useLayoutEffect(() => {
    if (settings.enableTelemetry === false) {
      mixpanel.opt_out_tracking();
      return;
    } else {
      return enableAutoTrack(document.body, mixpanel.track);
    }
  }, [settings.enableTelemetry]);
  return null;
}
