import { assertExists } from '@blocksuite/global/utils';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/plugin-infra/atom';
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
  const [id, setId] = useAtom(currentWorkspaceIdAtom);
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
  const setPageId = useSetAtom(currentPageIdAtom);
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
