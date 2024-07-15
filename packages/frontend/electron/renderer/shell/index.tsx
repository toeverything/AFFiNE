import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { appConfigProxy } from '@affine/core/hooks/use-app-config-storage';
import { performanceLogger } from '@affine/core/shared';
import {
  configureGlobalStorageModule,
  Framework,
  FrameworkRoot,
} from '@toeverything/infra';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShellRoot } from './shell';

const framework = new Framework();
configureGlobalStorageModule(framework);
const frameworkProvider = framework.provider();

const logger = performanceLogger.namespace('shell');

function main() {
  appConfigProxy
    .getSync()
    .catch(() => console.error('failed to load app config'));
}

function mountApp() {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Root element not found');
  }
  logger.info('render app');
  createRoot(root).render(
    <StrictMode>
      <FrameworkRoot framework={frameworkProvider}>
        <ShellRoot />
      </FrameworkRoot>
    </StrictMode>
  );
}

try {
  main();
  mountApp();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}
