import './setup';

import { appConfigProxy } from '@affine/core/components/hooks/use-app-config-storage';
import { Telemetry } from '@affine/core/components/telemetry';
import { ensureYOctoWasmReady } from '@toeverything/infra';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

async function main() {
  // load persistent config for electron
  // TODO(@Peng): should be sync, but it's not necessary for now
  appConfigProxy
    .getSync()
    .catch(() => console.error('failed to load app config'));

  await ensureYOctoWasmReady();
  mountApp();
}

function mountApp() {
  // oxlint-disable-next-line typescript/no-non-null-assertion
  const root = document.getElementById('app')!;
  createRoot(root).render(
    <StrictMode>
      <Telemetry />
      <App />
    </StrictMode>
  );
}

main().catch(err => {
  console.error('Failed to bootstrap app', err);
});
