import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

function createSentry() {
  let client: Sentry.BrowserClient | undefined;
  const wrapped = {
    init() {
      if (!globalThis.SENTRY_RELEASE) {
        // https://docs.sentry.io/platforms/javascript/guides/react/#configure
        client = Sentry.init({
          dsn: BUILD_CONFIG.SENTRY_DSN,
          debug: BUILD_CONFIG.debug ?? false,
          environment: BUILD_CONFIG.appBuildType,
          integrations: [
            Sentry.reactRouterV6BrowserTracingIntegration({
              useEffect,
              useLocation,
              useNavigationType,
              createRoutesFromChildren,
              matchRoutes,
            }),
          ],
        }) as Sentry.BrowserClient;

        Sentry.setTags({
          distribution: BUILD_CONFIG.distribution,
          appVersion: BUILD_CONFIG.appVersion,
          editorVersion: BUILD_CONFIG.editorVersion,
        });
      }
    },
    enable() {
      if (client) {
        client.getOptions().enabled = true;
      }
    },
    disable() {
      if (client) {
        client.getOptions().enabled = false;
      }
    },
  };

  return wrapped;
}

export const sentry = createSentry();
