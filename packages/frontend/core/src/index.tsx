import 'ses';
import './polyfill/intl-segmenter';
import './polyfill/request-idle-callback';

import { assertExists } from '@blocksuite/global/utils';
import { getCurrentStore } from '@toeverything/infra/atom';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { bootstrapPluginSystem } from './bootstrap/register-plugins';
import { setup } from './bootstrap/setup';
import { performanceLogger } from './shared';

const performanceMainLogger = performanceLogger.namespace('main');
function main() {
  performanceMainLogger.info('start');

  // skip bootstrap setup for desktop onboarding
  if (window.appInfo?.windowName !== 'onboarding') {
    const rootStore = getCurrentStore();
    performanceMainLogger.info('setup start');
    setup();
    performanceMainLogger.info('setup done');

    bootstrapPluginSystem(rootStore).catch(err => {
      console.error('Failed to bootstrap plugin system', err);
    });
  }

  mountApp();
}

function mountApp() {
  performanceMainLogger.info('import app');
  const root = document.getElementById('app');
  assertExists(root);
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
