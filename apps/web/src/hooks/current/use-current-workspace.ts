import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import type { AllWorkspace } from '../../shared';

export function useCurrentWorkspace(): [
  AllWorkspace,
  (id: string | null) => void,
] {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const setId = useSetAtom(rootCurrentWorkspaceIdAtom);
  const setPageId = useSetAtom(rootCurrentPageIdAtom);
  return [
    currentWorkspace,
    useCallback(
      (id: string | null) => {
        if (environment.isBrowser && id) {
          localStorage.setItem('last_workspace_id', id);
        }
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ];
}
