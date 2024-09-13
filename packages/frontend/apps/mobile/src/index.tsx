import './setup';

import { performanceLogger } from '@affine/core/shared';
import {
  init,
  reactRouterV6BrowserTracingIntegration,
  setTags,
} from '@sentry/react';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import { App } from './app';

const performanceMainLogger = performanceLogger.namespace('main');
function main() {
  performanceMainLogger.info('setup start');
  if (window.SENTRY_RELEASE || environment.isDebug) {
    // https://docs.sentry.io/platforms/javascript/guides/react/#configure
    init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.BUILD_TYPE ?? 'development',
      integrations: [
        reactRouterV6BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      ],
    });
    setTags({
      appVersion: runtimeConfig.appVersion,
      editorVersion: runtimeConfig.editorVersion,
    });
  }
  performanceMainLogger.info('setup done');
  mountApp();
}

function mountApp() {
  performanceMainLogger.info('import app');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const root = document.getElementById('app')!;
  performanceMainLogger.info('render app');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

try {
  main();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}
