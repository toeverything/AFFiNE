import './register-blocksuite-components';

import { setupGlobal } from '@affine/env/global';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

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

  performanceSetupLogger.info('done');
}
