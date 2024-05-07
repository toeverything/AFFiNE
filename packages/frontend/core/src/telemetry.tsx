import { appSettingAtom } from '@toeverything/infra';
import { useAtomValue } from 'jotai/react';
import mixpanel from 'mixpanel-browser';
import { useLayoutEffect } from 'react';

export function Telemetry() {
  const settings = useAtomValue(appSettingAtom);
  useLayoutEffect(() => {
    if (settings.enableTelemetry === false) {
      mixpanel.opt_out_tracking();
    }
  }, [settings.enableTelemetry]);
  return null;
}
