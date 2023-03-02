import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { currentPageIdAtom, currentWorkspaceIdAtom } from '../../atoms';
import { RemWorkspace } from '../../shared';

export const currentWorkspaceAtom = atom<
  RemWorkspace | null | Promise<RemWorkspace | null>
>(async get => {
  const currentId = get(currentWorkspaceIdAtom);
  if (currentId === null) {
    return null;
  }
  const target = dataCenter.workspaces.find(
    workspace => workspace.id === currentId
  );
  if (!target) {
    return new Promise(resolve => {
      const listener = () => {
        const target = dataCenter.workspaces.find(
          workspace => workspace.id === currentId
        );
        if (target) {
          resolve(target);
          dataCenter.callbacks.delete(listener);
        }
      };
      dataCenter.callbacks.add(listener);
    });
  }
  return target;
});

export function useCurrentWorkspace(): [
  RemWorkspace | null,
  (id: string | null) => void
] {
  const setId = useSetAtom(currentWorkspaceIdAtom);
  const setPageId = useSetAtom(currentPageIdAtom);
  return [
    useAtomValue(currentWorkspaceAtom),
    useCallback(
      (id: string | null) => {
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ];
}
