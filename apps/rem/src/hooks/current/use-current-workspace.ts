import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { currentPageIdAtom, currentWorkspaceIdAtom } from '../../atoms';
import { useWorkspace } from '../use-workspace';

export function useCurrentWorkspace() {
  const [id, setId] = useAtom(currentWorkspaceIdAtom);
  const [, setPageId] = useAtom(currentPageIdAtom);
  return [
    useWorkspace(id),
    useCallback(
      (id: string | null) => {
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ] as const;
}
