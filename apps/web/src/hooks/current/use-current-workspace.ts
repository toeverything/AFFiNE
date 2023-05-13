import { useAtom, useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { currentPageIdAtom, currentWorkspaceIdAtom } from '../../atoms';
import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import type { AllWorkspace } from '../../shared';

/**
 * @deprecated use `rootCurrentWorkspaceAtom` instead
 */
export const currentWorkspaceAtom = rootCurrentWorkspaceAtom;

export function useCurrentWorkspace(): [
  AllWorkspace,
  (id: string | null) => void
] {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const [, setId] = useAtom(currentWorkspaceIdAtom);
  const [, setPageId] = useAtom(currentPageIdAtom);
  return [
    currentWorkspace,
    useCallback(
      (id: string | null) => {
        if (typeof window !== 'undefined' && id) {
          localStorage.setItem('last_workspace_id', id);
        }
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ];
}
