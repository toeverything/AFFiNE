import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import type { AllWorkspace } from '../../shared';
import { useWorkspace } from '../use-workspace';

declare global {
  /**
   * @internal debug only
   */
  // eslint-disable-next-line no-var
  var currentWorkspace: AllWorkspace | undefined;
  interface WindowEventMap {
    'affine:workspace:change': CustomEvent<{ id: string }>;
  }
}

export function useCurrentWorkspace(): [
  AllWorkspace,
  (id: string | null) => void,
] {
  const [id, setId] = useAtom(rootCurrentWorkspaceIdAtom);
  assertExists(id);
  const currentWorkspace = useWorkspace(id);
  useEffect(() => {
    globalThis.currentWorkspace = currentWorkspace;
    globalThis.dispatchEvent(
      new CustomEvent('affine:workspace:change', {
        detail: { id: currentWorkspace.id },
      })
    );
  }, [currentWorkspace]);
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
