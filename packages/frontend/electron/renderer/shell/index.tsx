import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { appConfigProxy } from '@affine/core/hooks/use-app-config-storage';
import { performanceLogger } from '@affine/core/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShellRoot } from './shell';

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
      <ShellRoot />
    </StrictMode>
  );
}

try {
  main();
  mountApp();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}
