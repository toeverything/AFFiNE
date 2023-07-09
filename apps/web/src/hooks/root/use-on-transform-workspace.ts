import type {
  WorkspaceFlavour,
  WorkspaceRegistry,
} from '@affine/env/workspace';
import { WorkspaceVersion } from '@affine/env/workspace';
import {
  rootWorkspacesMetadataAtom,
  workspaceAdaptersAtom,
} from '@affine/workspace/atom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { openSettingModalAtom } from '../../atoms';

export function useOnTransformWorkspace() {
  const setSettingModal = useSetAtom(openSettingModalAtom);
  const WorkspaceAdapters = useAtomValue(workspaceAdaptersAtom);
  const setMetadata = useSetAtom(rootWorkspacesMetadataAtom);
  return useCallback(
    async <From extends WorkspaceFlavour, To extends WorkspaceFlavour>(
      from: From,
      to: To,
      workspace: WorkspaceRegistry[From]
    ): Promise<void> => {
      // create first, then delete, in case of failure
      const newId = await WorkspaceAdapters[to].CRUD.create(
        workspace.blockSuiteWorkspace
      );
      await WorkspaceAdapters[from].CRUD.delete(workspace.blockSuiteWorkspace);
      await setMetadata(workspaces => {
        const idx = workspaces.findIndex(ws => ws.id === workspace.id);
        workspaces.splice(idx, 1, {
          id: newId,
          flavour: to,
          version: WorkspaceVersion.SubDoc,
        });
        return [...workspaces];
      }, newId);
      // fixme(himself65): setting modal could still open and open the non-exist workspace
      setSettingModal(settings => ({
        ...settings,
        open: false,
      }));
      window.dispatchEvent(
        new CustomEvent('affine-workspace:transform', {
          detail: {
            from,
            to,
            oldId: workspace.id,
            newId: newId,
          },
        })
      );
    },
    [WorkspaceAdapters, setMetadata, setSettingModal]
  );
}

declare global {
  // global Events
  interface WindowEventMap {
    'affine-workspace:transform': CustomEvent<{
      from: WorkspaceFlavour;
      to: WorkspaceFlavour;
      oldId: string;
      newId: string;
    }>;
  }
}
