import { migrateToSubdoc } from '@affine/env/blocksuite';
import { config, setupGlobal } from '@affine/env/config';
import type {
  LocalIndexedDBDownloadProvider,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import { WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/global/utils';
import { nanoid, Workspace } from '@blocksuite/store';
import { rootStore } from '@toeverything/plugin-infra/manager';
import type { Doc } from 'yjs';

import { WorkspaceAdapters } from '../adapters/workspace';

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

rootStore.sub(rootWorkspacesMetadataAtom, () => {
  const metadata = rootStore.get(rootWorkspacesMetadataAtom);
  metadata.forEach(oldMeta => {
    if (!oldMeta.version) {
      const adapter = WorkspaceAdapters[oldMeta.flavour];
      assertExists(adapter);
      const upgrade = async () => {
        const workspace = await adapter.CRUD.get(oldMeta.id);
        if (!workspace) {
          console.warn('cannot find workspace', oldMeta.id);
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
          rootStore.set(rootWorkspacesMetadataAtom, metadata =>
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
        // remove old workspace from metadata
        rootStore.set(rootWorkspacesMetadataAtom, metadata =>
          metadata
            .map(newMeta => (newMeta.id === oldMeta.id ? null : newMeta))
            .filter((meta): meta is RootWorkspaceMetadata => !!meta)
        );
        const newBlockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          oldMeta.flavour as WorkspaceFlavour.LOCAL
        );
        const applyUpdateRecursive = (doc: Doc, dataDoc: Doc) => {
          Workspace.Y.applyUpdate(
            doc,
            Workspace.Y.encodeStateAsUpdate(dataDoc)
          );
          doc.subdocs.forEach(subdoc => {
            dataDoc.subdocs.forEach(dataSubdoc => {
              if (subdoc.guid === dataSubdoc.guid) {
                applyUpdateRecursive(subdoc, dataSubdoc);
              }
            });
          });
        };

        applyUpdateRecursive(newBlockSuiteWorkspace.doc, newDoc);

        const newId = await adapter.CRUD.create(newBlockSuiteWorkspace);
        await adapter.CRUD.delete(workspace as any);
        rootStore.set(rootWorkspacesMetadataAtom, metadata => [
          ...metadata,
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
});
