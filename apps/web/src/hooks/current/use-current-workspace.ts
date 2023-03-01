import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { currentPageIdAtom, currentWorkspaceIdAtom } from '../../atoms';
import { RemWorkspace } from '../../shared';
import { useWorkspace } from '../use-workspace';

export function useCurrentWorkspace(): [
  RemWorkspace | null,
  (id: string | null) => void
] {
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
  ];
}
