import './register-blocksuite-components';
import './edgeless-template';

import { apis, events } from '@affine/electron-api';
import { setupGlobal } from '@affine/env/global';
import * as Sentry from '@sentry/react';
import { debounce } from 'lodash-es';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import { appConfigProxy } from '../hooks/use-app-config-storage';
import { performanceLogger } from '../shared';

const performanceSetupLogger = performanceLogger.namespace('setup');

export function setup() {
  performanceSetupLogger.info('start');

  performanceSetupLogger.info('setup global');
  setupGlobal();

  if (window.SENTRY_RELEASE || environment.isDebug) {
    // https://docs.sentry.io/platforms/javascript/guides/react/#configure
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.BUILD_TYPE ?? 'development',
      integrations: [
        new Sentry.BrowserTracing({
          routingInstrumentation: Sentry.reactRouterV6Instrumentation(
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes
          ),
        }),
        new Sentry.Replay(),
      ],
      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      tracesSampleRate: 1.0,
    });
    Sentry.setTags({
      appVersion: runtimeConfig.appVersion,
      editorVersion: runtimeConfig.editorVersion,
    });
  }

  // load persistent config for electron
  // TODO: should be sync, but it's not necessary for now
  if (environment.isDesktop) {
    appConfigProxy
      .getSync()
      .catch(() => console.error('failed to load app config'));
    const handleMaximized = (maximized: boolean | undefined) => {
      document.documentElement.dataset.maximized = String(maximized);
    };
    apis?.ui.isMaximized().then(handleMaximized).catch(console.error);
    events?.ui.onMaximized(handleMaximized);

    const handleResize = debounce(() => {
      apis?.ui.handleWindowResize().catch(console.error);
    }, 50);
    window.addEventListener('resize', handleResize);
  }

  performanceSetupLogger.info('done');
}
