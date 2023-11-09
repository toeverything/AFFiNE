import { WorkspaceFallback } from '@affine/component/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { getCurrentStore } from '@toeverything/infra/atom';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { bootstrapPluginSystem } from './bootstrap/register-plugins';
import { performanceLogger } from './shared';

const performanceMainLogger = performanceLogger.namespace('main');
async function main() {
  performanceMainLogger.info('start');
  const { setup } = await import('./bootstrap/setup');

  const rootStore = getCurrentStore();
  performanceMainLogger.info('setup start');
  await setup(rootStore);
  performanceMainLogger.info('setup done');

  bootstrapPluginSystem(rootStore).catch(err => {
    console.error('Failed to bootstrap plugin system', err);
  });

  performanceMainLogger.info('import app');
  const { App } = await import('./app');
  const root = document.getElementById('app');
  assertExists(root);

  performanceMainLogger.info('render app');
  createRoot(root).render(
    <StrictMode>
      <Suspense fallback={<WorkspaceFallback key="AppLoading" />}>
        <App />
      </Suspense>
    </StrictMode>
  );
}

await main();
