import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import type { Workspace } from '@blocksuite/store';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import type { MigrationPoint } from '@toeverything/infra/blocksuite';
import {
  migrateLocalBlobStorage,
  migrateWorkspace,
} from '@toeverything/infra/blocksuite';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { WorkspaceAdapters } from '../../adapters/workspace';
import { useCurrentSyncEngine } from '../../hooks/current/use-current-sync-engine';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';

export type UpgradeState = 'pending' | 'upgrading' | 'done' | 'error';

function applyDoc(target: YDoc, result: YDoc) {
  applyUpdate(target, encodeStateAsUpdate(result));
  for (const targetSubDoc of target.subdocs.values()) {
    const resultSubDocs = Array.from(result.subdocs.values());
    const resultSubDoc = resultSubDocs.find(
      item => item.guid === targetSubDoc.guid
    );
    if (resultSubDoc) {
      applyDoc(targetSubDoc, resultSubDoc);
    }
  }
}

export function useUpgradeWorkspace(migration: MigrationPoint) {
  const [state, setState] = useState<UpgradeState>('pending');
  const [error, setError] = useState<Error | null>(null);
  const [newWorkspaceId, setNewWorkspaceId] = useState<string | null>(null);

  const [workspace] = useCurrentWorkspace();
  const syncEngine = useCurrentSyncEngine();
  const rootStore = getCurrentStore();

  const upgradeWorkspace = useAsyncCallback(async () => {
    setState('upgrading');
    setError(null);
    try {
      // Migration need to wait for root doc and all subdocs loaded.
      await syncEngine?.waitForSynced();

      // Clone a new doc to prevent change events.
      const clonedDoc = new YDoc({
        guid: workspace.blockSuiteWorkspace.doc.guid,
      });
      applyDoc(clonedDoc, workspace.blockSuiteWorkspace.doc);
      const schema = workspace.blockSuiteWorkspace.schema;
      let newWorkspace: Workspace | null = null;

      const resultDoc = await migrateWorkspace(migration, {
        doc: clonedDoc,
        schema,
        createWorkspace: () => {
          // Migrate to subdoc version need to create a new workspace.
          // It will only happened for old local workspace.
          newWorkspace = getOrCreateWorkspace(nanoid(), WorkspaceFlavour.LOCAL);
          return Promise.resolve(newWorkspace);
        },
      });

      if (newWorkspace) {
        const localMetaString =
          localStorage.getItem('jotai-workspaces') ?? '[]';
        const localMetadataList = JSON.parse(
          localMetaString
        ) as RootWorkspaceMetadata[];
        const currentLocalMetadata = localMetadataList.find(
          item => item.id === workspace.id
        );
        const flavour = currentLocalMetadata?.flavour ?? WorkspaceFlavour.LOCAL;

        // Legacy logic moved from `setup.ts`.
        // It works well before, should be refactor or remove in the future.
        const adapter = WorkspaceAdapters[flavour];
        const newId = await adapter.CRUD.create(newWorkspace);
        const [workspaceAtom] = getBlockSuiteWorkspaceAtom(newId);
        await rootStore.get(workspaceAtom); // Trigger provider sync to persist data.

        await adapter.CRUD.delete(workspace.blockSuiteWorkspace);
        await migrateLocalBlobStorage(workspace.id, newId);
        setNewWorkspaceId(newId);

        const index = localMetadataList.findIndex(
          meta => meta.id === workspace.id
        );
        localMetadataList[index] = {
          ...currentLocalMetadata,
          id: newId,
          flavour,
        };
        localStorage.setItem(
          'jotai-workspaces',
          JSON.stringify(localMetadataList)
        );
        localStorage.setItem('last_workspace_id', newId);
        localStorage.removeItem('last_page_id');
      } else {
        applyDoc(workspace.blockSuiteWorkspace.doc, resultDoc);
      }

      await syncEngine?.waitForSynced();

      setState('done');
    } catch (e: any) {
      console.error(e);
      setError(e);
      setState('error');
    }
  }, [rootStore, workspace, syncEngine, migration]);

  return [state, error, upgradeWorkspace, newWorkspaceId] as const;
}
