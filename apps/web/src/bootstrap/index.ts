import { migrateToSubdoc } from '@affine/env/blocksuite';
import { platformSchema, setupGlobal } from '@affine/env/global';
import type {
  LocalIndexedDBDownloadProvider,
  WorkspaceAdapter,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { workspaceAdaptersAtom } from '@affine/workspace/atom';
import {
  migrateLocalBlobStorage,
  upgradeV1ToV2,
} from '@affine/workspace/migration';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import { rootStore } from '@toeverything/plugin-infra/manager';

import { WorkspaceAdapters } from '../adapters/workspace';

setupGlobal();

rootStore.set(
  workspaceAdaptersAtom,
  WorkspaceAdapters as Record<
    WorkspaceFlavour,
    WorkspaceAdapter<WorkspaceFlavour>
  >
);

if (process.env.NODE_ENV === 'development') {
  console.log('Runtime Preset', runtimeConfig);
}

if (runtimeConfig.enablePlugin && !environment.isServer) {
  import('@affine/copilot');
}

if (!environment.isServer) {
  import('@affine/bookmark-block');
}

// platform check
{
  if (globalThis.platform) {
    platformSchema.parse(globalThis.platform);
  }
}

if (!environment.isDesktop && !environment.isServer) {
  // Polyfill Electron
  const unimplemented = () => {
    throw new Error('AFFiNE Plugin Web will be supported in the future');
  };
  const affine = {
    ipcRenderer: {
      invoke: unimplemented,
      send: unimplemented,
      on: unimplemented,
      once: unimplemented,
      removeListener: unimplemented,
    },
  };

  Object.freeze(affine);

  Object.defineProperty(window, 'affine', {
    value: affine,
    writable: false,
  });
}

if (environment.isBrowser) {
  const value = localStorage.getItem('jotai-workspaces');
  if (value) {
    try {
      const metadata = JSON.parse(value) as RootWorkspaceMetadata[];
      const promises: Promise<void>[] = [];
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
            const provider = createIndexedDBDownloadProvider(
              workspace.id,
              doc,
              {
                awareness:
                  workspace.blockSuiteWorkspace.awarenessStore.awareness,
              }
            ) as LocalIndexedDBDownloadProvider;
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
          window.dispatchEvent(new CustomEvent('migration-done'));
          window.$migrationDone = true;
        });
    } catch (e) {
      console.error('error when migrating data', e);
    }
  }
}
