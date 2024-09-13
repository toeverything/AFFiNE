// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import { DebugLogger } from '@affine/debug';
import type { OverridedMixpanel } from 'mixpanel-browser';
import mixpanelBrowser from 'mixpanel-browser';

const logger = new DebugLogger('mixpanel');

type Middleware = (
  name: string,
  properties?: Record<string, unknown>
) => Record<string, unknown>;

function createMixpanel() {
  let mixpanel;
  if (process.env.MIXPANEL_TOKEN) {
    mixpanelBrowser.init(process.env.MIXPANEL_TOKEN || '', {
      track_pageview: true,
      persistence: 'localStorage',
      api_host: 'https://telemetry.affine.run',
      ignore_dnt: true,
    });
    mixpanel = mixpanelBrowser;
  } else {
    mixpanel = new Proxy(
      function () {} as unknown as OverridedMixpanel,
      createProxyHandler()
    );
  }

  const middlewares = new Set<Middleware>();

  const wrapped = {
    init() {
      mixpanel.register({
        appVersion: BUILD_CONFIG.appVersion,
        environment: BUILD_CONFIG.appBuildType,
        editorVersion: BUILD_CONFIG.editorVersion,
        isSelfHosted: BUILD_CONFIG.isSelfHosted,
        isDesktop: BUILD_CONFIG.isElectron,
      });
    },
    reset() {
      mixpanel.reset();
      this.init();
    },
    track(event_name: string, properties?: Record<string, any>) {
      const middlewareProperties = Array.from(middlewares).reduce(
        (acc, middleware) => {
          return middleware(event_name, acc);
        },
        properties as Record<string, unknown>
      );
      logger.debug('track', event_name, middlewareProperties);

      mixpanel.track(event_name as string, middlewareProperties);
    },
    middleware(cb: Middleware): () => void {
      middlewares.add(cb);
      return () => {
        middlewares.delete(cb);
      };
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

  return wrapped;
}

export const mixpanel = createMixpanel();
mixpanel.init();

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
