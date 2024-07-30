import { DebugLogger } from '@affine/debug';
import type { OverridedMixpanel } from 'mixpanel-browser';
import mixpanelBrowser from 'mixpanel-browser';

import type { GeneralMixpanelEvent, MixpanelEvents } from './events';

const logger = new DebugLogger('mixpanel');

function createMixpanel() {
  let mixpanel;
  if (process.env.MIXPANEL_TOKEN) {
    mixpanelBrowser.init(process.env.MIXPANEL_TOKEN || '', {
      track_pageview: true,
      persistence: 'localStorage',
      api_host: 'https://telemetry.affine.run',
    });
    mixpanel = mixpanelBrowser;
  } else {
    mixpanel = new Proxy(
      function () {} as unknown as OverridedMixpanel,
      createProxyHandler()
    );
  }

  const wrapped = {
    reset() {
      mixpanel.reset();
      mixpanel.register({
        appVersion: runtimeConfig.appVersion,
        environment: runtimeConfig.appBuildType,
        editorVersion: runtimeConfig.editorVersion,
        isSelfHosted: Boolean(runtimeConfig.isSelfHosted),
        isDesktop: environment.isDesktop,
      });
    },
    track<
      T extends string,
      P extends (T extends keyof MixpanelEvents
        ? MixpanelEvents[T]
        : Record<string, unknown>) &
        GeneralMixpanelEvent,
    >(event_name: T, properties?: P) {
      logger.debug('track', event_name, properties);
      mixpanel.track(event_name, properties);
    },
    opt_out_tracking() {
      mixpanel.opt_out_tracking();
    },
    opt_in_tracking() {
      mixpanel.opt_in_tracking();
    },
    has_opted_in_tracking() {
      mixpanel.has_opted_in_tracking();
    },
    has_opted_out_tracking() {
      mixpanel.has_opted_out_tracking();
    },
    identify(unique_id?: string) {
      mixpanel.identify(unique_id);
    },
    get people() {
      return mixpanel.people;
    },
    track_pageview(properties?: { location?: string }) {
      logger.debug('track_pageview', properties);
      mixpanel.track_pageview(properties);
    },
  };

  wrapped.reset();

  return wrapped;
}

export const mixpanel = createMixpanel();

function createProxyHandler() {
  const handler = {
    get: () => {
      return new Proxy(
        function () {} as unknown as OverridedMixpanel,
        createProxyHandler()
      );
    },
    apply: () => {},
  } as ProxyHandler<OverridedMixpanel>;
  return handler;
}
