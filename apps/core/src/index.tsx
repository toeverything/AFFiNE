import { assertExists } from '@blocksuite/global/utils';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

async function main() {
  await import('./bootstrap/before-app');
  const { App } = await import('./app');
  const root = document.getElementById('app');
  assertExists(root);

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

await main();
