import { atomWithSyncStorage } from '@affine/jotai';
import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  workspaceByIdAtomFamily,
} from '../../atoms';
import type { AllWorkspace } from '../../shared';

export const currentWorkspaceAtom = atom<Promise<AllWorkspace | null>>(
  async get => {
    const id = get(currentWorkspaceIdAtom);
    const allIds = get(jotaiWorkspacesAtom).map(w => w.id);
    return get(
      workspaceByIdAtomFamily(id && allIds.includes(id) ? id : allIds[0])
    );
  }
);

export const lastWorkspaceIdAtom = atomWithSyncStorage<string | null>(
  'last_workspace_id',
  null
);

export function useCurrentWorkspace(): [
  AllWorkspace | null,
  (id: string | null) => void
] {
  const currentWorkspace = useAtomValue(currentWorkspaceAtom);
  const [, setId] = useAtom(currentWorkspaceIdAtom);
  const [, setPageId] = useAtom(currentPageIdAtom);
  const setLast = useSetAtom(lastWorkspaceIdAtom);

  return [
    currentWorkspace,
    useCallback(
      (id: string | null) => {
        setPageId(null);
        setLast(id);
        setId(id);
      },
      [setId, setLast, setPageId]
    ),
  ];
}
