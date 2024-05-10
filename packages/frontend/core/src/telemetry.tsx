import { appSettingAtom } from '@toeverything/infra';
import { useAtomValue } from 'jotai/react';
import { useLayoutEffect } from 'react';

import { mixpanel } from './utils';

export function Telemetry() {
  const settings = useAtomValue(appSettingAtom);
  useLayoutEffect(() => {
    if (settings.enableTelemetry === false) {
      mixpanel.opt_out_tracking();
    }
  }, [settings.enableTelemetry]);
  return null;
}
