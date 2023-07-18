import { migrateToSubdoc } from '@affine/env/blocksuite';
import { setupGlobal } from '@affine/env/global';
import type { LocalIndexedDBDownloadProvider } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import { type WorkspaceAdapter } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { workspaceAdaptersAtom } from '@affine/workspace/atom';
import {
  migrateLocalBlobStorage,
  upgradeV1ToV2,
} from '@affine/workspace/migration';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
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

const value = localStorage.getItem('jotai-workspaces');
if (value) {
  try {
    const metadata = JSON.parse(value) as RootWorkspaceMetadata[];
    const promises: Promise<void>[] = [];
    const newMetadata = [...metadata];
    metadata.forEach(oldMeta => {
      if (!('version' in oldMeta)) {
        const adapter = WorkspaceAdapters[oldMeta.flavour];
        assertExists(adapter);
        const upgrade = async () => {
          const workspace = await adapter.CRUD.get(oldMeta.id);
          if (!workspace) {
            console.warn('cannot find workspace', oldMeta.id);
            return;
          }
          if (workspace.flavour !== WorkspaceFlavour.LOCAL) {
            console.warn('not supported');
            return;
          }
          const doc = workspace.blockSuiteWorkspace.doc;
          const provider = createIndexedDBDownloadProvider(workspace.id, doc, {
            awareness: workspace.blockSuiteWorkspace.awarenessStore.awareness,
          }) as LocalIndexedDBDownloadProvider;
          provider.sync();
          await provider.whenReady;
          const newDoc = migrateToSubdoc(doc);
          if (doc === newDoc) {
            console.log('doc not changed');
            return;
          }
          const newWorkspace = upgradeV1ToV2(workspace);

          const newId = await adapter.CRUD.create(
            newWorkspace.blockSuiteWorkspace
          );

          await adapter.CRUD.delete(workspace as any);
          console.log('migrated', oldMeta.id, newId);
          const index = newMetadata.findIndex(meta => meta.id === oldMeta.id);
          newMetadata[index] = {
            ...oldMeta,
            id: newId,
            version: WorkspaceVersion.SubDoc,
          };
          await migrateLocalBlobStorage(workspace.id, newId);
        };

        // create a new workspace and push it to metadata
        promises.push(upgrade());
      }
    });

    Promise.all(promises)
      .then(() => {
        console.log('migration done');
      })
      .catch(() => {
        console.error('migration failed');
      })
      .finally(() => {
        localStorage.setItem('jotai-workspaces', JSON.stringify(newMetadata));
        window.dispatchEvent(new CustomEvent('migration-done'));
        window.$migrationDone = true;
      });
  } catch (e) {
    console.error('error when migrating data', e);
  }
}

// start app
import('./app').then(({ App }) => {
  const root = document.getElementById('app');
  assertExists(root);

  createRoot(root).render(<App />);
});
