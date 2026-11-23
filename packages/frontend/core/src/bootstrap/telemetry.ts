import { sentry, tracker } from '@affine/track';
import { APP_SETTINGS_STORAGE_KEY } from '@toeverything/infra/atom';

tracker.init();
sentry.init();

if (typeof localStorage !== 'undefined') {
  let enabled = true;
  const settingsStr = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);

  if (settingsStr) {
    const parsed = JSON.parse(settingsStr);
    enabled = parsed.enableTelemetry;
  }

  if (!enabled) {
    // NOTE: telemetry setting is respected by tracker and sentry.
    sentry.disable();
    tracker.opt_out_tracking();
  }
}
