import { isWindow } from '@affine/env';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { rootCurrentWorkspaceAtom } from '../../atoms/root';
import type { AllWorkspace } from '../../shared';

export function useCurrentWorkspace(): [
  AllWorkspace,
  (id: string | null) => void
] {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const [, setId] = useAtom(rootCurrentWorkspaceIdAtom);
  const [, setPageId] = useAtom(rootCurrentPageIdAtom);
  return [
    currentWorkspace,
    useCallback(
      (id: string | null) => {
        if (isWindow && id) {
          localStorage.setItem('last_workspace_id', id);
        }
        setPageId(null);
        setId(id);
      },
      [setId, setPageId]
    ),
  ];
}
