import { atomWithSyncStorage } from '@affine/jotai';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { currentPageIdAtom, currentWorkspaceIdAtom } from '../../atoms';
import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import type { AllWorkspace } from '../../shared';

/**
 * @deprecated use `rootCurrentWorkspaceAtom` instead
 */
export const currentWorkspaceAtom = rootCurrentWorkspaceAtom;

export const lastWorkspaceIdAtom = atomWithSyncStorage<string | null>(
  'last_workspace_id',
  null
);

export function useCurrentWorkspace(): [
  AllWorkspace | null,
  (id: string | null) => void
] {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
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
