import { migrateToSubdoc } from '@affine/env/blocksuite';
import { config, setupGlobal } from '@affine/env/config';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/global/utils';
import { nanoid, Workspace } from '@blocksuite/store';
import { rootStore } from '@toeverything/plugin-infra/manager';

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
      console.log('need migration', oldMeta);
      const adapter = WorkspaceAdapters[oldMeta.flavour];
      assertExists(adapter);
      // remove old workspace from metadata
      rootStore.set(rootWorkspacesMetadataAtom, metadata =>
        metadata
          .map(newMeta => (newMeta.id === oldMeta.id ? null : newMeta))
          .filter((meta): meta is RootWorkspaceMetadata => !!meta)
      );
      const upgrade = async () => {
        const workspace = await adapter.CRUD.get(oldMeta.id);
        if (!workspace) {
          console.warn('cannot find workspace', oldMeta.id);
          return;
        }
        const doc = workspace.blockSuiteWorkspace.doc;
        const newDoc = migrateToSubdoc(doc);
        if (doc === newDoc) {
          console.warn('doc not changed');
          return;
        }
        const newBlockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
          nanoid(),
          oldMeta.flavour as WorkspaceFlavour.LOCAL
        );
        Workspace.Y.applyUpdate(
          newBlockSuiteWorkspace.doc,
          Workspace.Y.encodeStateAsUpdate(newDoc)
        );
        const newId = await adapter.CRUD.create(newBlockSuiteWorkspace);
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
