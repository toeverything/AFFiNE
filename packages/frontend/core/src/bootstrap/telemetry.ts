import { mixpanel, sentry } from '@affine/track';
import { APP_SETTINGS_STORAGE_KEY } from '@toeverything/infra/atom';

mixpanel.init();
sentry.init();

if (typeof localStorage !== 'undefined') {
  let enabled = true;
  const settingsStr = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);

  if (settingsStr) {
    const parsed = JSON.parse(settingsStr);
    enabled = parsed.enableTelemetry;
  }

  if (!enabled) {
    // NOTE(@forehalo): mixpanel will read local storage flag and doesn't need to be manually opt_out at startup time.
    // see: https://docs.mixpanel.com/docs/privacy/protecting-user-data
    // mixpanel.opt_out_tracking();
    sentry.disable();
  }
}
