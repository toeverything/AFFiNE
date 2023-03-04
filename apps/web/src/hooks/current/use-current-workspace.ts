import { atom, useAtom, useAtomValue } from 'jotai';
import { useCallback } from 'react';

import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  workspacesAtom,
} from '../../atoms';
import { RemWorkspace } from '../../shared';

export const currentWorkspaceAtom = atom<Promise<RemWorkspace | null>>(
  async get => {
    const id = get(currentWorkspaceIdAtom);
    const workspaces = await get(workspacesAtom);
    return workspaces.find(workspace => workspace.id === id) ?? null;
  }
);

export function useCurrentWorkspace(): [
  RemWorkspace | null,
  (id: string | null) => void
] {
  const currentWorkspace = useAtomValue(currentWorkspaceAtom);
  const [, setId] = useAtom(currentWorkspaceIdAtom);
  const [, setPageId] = useAtom(currentPageIdAtom);
  return [
    currentWorkspace,
    useCallback(
      (id: string | null) => {
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ];
}
