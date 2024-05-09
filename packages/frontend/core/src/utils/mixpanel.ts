import { DebugLogger } from '@affine/debug';
import type { OverridedMixpanel } from 'mixpanel-browser';
import mixpanelBrowser from 'mixpanel-browser';

const logger = new DebugLogger('affine:mixpanel');

export const mixpanel = process.env.MIXPANEL_TOKEN
  ? mixpanelBrowser
  : new Proxy(
      function () {} as unknown as OverridedMixpanel,
      createProxyHandler()
    );

function createProxyHandler(property?: string | symbol) {
  const handler = {
    get: (_target, childProperty) => {
      const path = property
        ? String(property) + '.' + String(childProperty)
        : String(childProperty);
      return new Proxy(
        function () {} as unknown as OverridedMixpanel,
        createProxyHandler(path)
      );
    },
    apply: (_target, _thisArg, args) => {
      logger.debug(
        `mixpanel.${property ? String(property) : 'mixpanel'}`,
        ...args
      );
    },
  } as ProxyHandler<OverridedMixpanel>;
  return handler;
}
