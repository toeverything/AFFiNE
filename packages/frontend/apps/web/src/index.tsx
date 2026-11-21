import './setup';

import { Telemetry } from '@affine/core/components/telemetry';
import { ensureYOctoWasmReady } from '@toeverything/infra';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

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

ensureYOctoWasmReady()
  .then(() => {
    mountApp();
  })
  .catch(err => {
    console.error('Failed to bootstrap app', err);
  });
