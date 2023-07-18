import { setupGlobal } from '@affine/env/global';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { type WorkspaceAdapter } from '@affine/env/workspace';
import { workspaceAdaptersAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { rootStore } from '@toeverything/plugin-infra/manager';
import { createRoot } from 'react-dom/client';

import { WorkspaceAdapters } from './adapters/workspace';

// bootstrap
setupGlobal();

rootStore.set(
  workspaceAdaptersAtom,
  WorkspaceAdapters as Record<
    WorkspaceFlavour,
    WorkspaceAdapter<WorkspaceFlavour>
  >
);

// start app
import('./app').then(({ App }) => {
  const root = document.getElementById('app');
  assertExists(root);

  createRoot(root).render(<App />);
});
