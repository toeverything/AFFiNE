import { migrateToSubdoc } from '@affine/env/blocksuite';
import { config, setupGlobal } from '@affine/env/config';
import type {
  LocalIndexedDBDownloadProvider,
  WorkspaceAdapter,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import {
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import {
  migrateLocalBlobStorage,
  upgradeV1ToV2,
} from '@affine/workspace/migration';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { assertExists } from '@blocksuite/global/utils';
import { rootStore } from '@toeverything/plugin-infra/manager';

import { WorkspaceAdapters } from '../adapters/workspace';

rootStore.set(
  workspaceAdaptersAtom,
  WorkspaceAdapters as Record<
    WorkspaceFlavour,
    WorkspaceAdapter<WorkspaceFlavour>
  >
);

setupGlobal();

if (config.enablePlugin && !environment.isServer) {
  import('@affine/copilot');
}

if (!environment.isServer) {
  import('@affine/bookmark-block');
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
  if (value && localStorage.getItem('migration-v2') !== 'true') {
    localStorage.setItem('migration-v2', 'true');
    try {
      const metadata = JSON.parse(value) as RootWorkspaceMetadata[];
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
              await rootStore.set(rootWorkspacesMetadataAtom, metadata =>
                metadata.map(newMeta =>
                  newMeta.id === oldMeta.id
                    ? {
                        ...newMeta,
                        version: WorkspaceVersion.SubDoc,
                      }
                    : newMeta
                )
              );
              return;
            }
            const newWorkspace = upgradeV1ToV2(workspace);

            const newId = await adapter.CRUD.create(
              newWorkspace.blockSuiteWorkspace
            );

            await adapter.CRUD.delete(workspace as any);
            await migrateLocalBlobStorage(workspace.id, newId);
            await rootStore.set(rootWorkspacesMetadataAtom, metadata => [
              ...metadata
                .map(newMeta => (newMeta.id === oldMeta.id ? null : newMeta))
                .filter((meta): meta is RootWorkspaceMetadata => !!meta),
              {
                id: newId,
                flavour: oldMeta.flavour,
                version: WorkspaceVersion.SubDoc,
              },
            ]);
          };

          // create a new workspace and push it to metadata
          upgrade().catch(console.error);
        }
      });
    } catch (e) {
      console.error('error when migrating data', e);
    }
  }
}
