import type { OverridedMixpanel } from 'mixpanel-browser';
import mixpanelBrowser from 'mixpanel-browser';

export const mixpanel = process.env.MIXPANEL_TOKEN
  ? mixpanelBrowser
  : new Proxy(
      function () {} as unknown as OverridedMixpanel,
      createProxyHandler()
    );

function createProxyHandler(property?: string | symbol) {
  const handler = {
    get: (_target, property) => {
      return new Proxy(
        function () {} as unknown as OverridedMixpanel,
        createProxyHandler(property)
      );
    },
    apply: (_target, _thisArg, args) => {
      console.info(
        `Mixpanel is not initialized, calling ${property ? String(property) : 'mixpanel'} with args: ${JSON.stringify(args)}`
      );
    },
  } as ProxyHandler<OverridedMixpanel>;
  return handler;
}
