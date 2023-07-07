import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import type { PassiveDocProvider, Workspace } from '@blocksuite/store';
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

const activeWorkspaceWeakMap = new WeakMap<Workspace, boolean>();

export function usePassiveWorkspaceEffect(workspace: Workspace) {
  useEffect(() => {
    if (activeWorkspaceWeakMap.get(workspace) === true) {
      return;
    }
    const providers = workspace.providers.filter(
      (provider): provider is PassiveDocProvider =>
        'passive' in provider && provider.passive === true
    );
    providers.forEach(provider => {
      provider.connect();
    });
    activeWorkspaceWeakMap.set(workspace, true);
    return () => {
      providers.forEach(provider => {
        provider.disconnect();
      });
      activeWorkspaceWeakMap.delete(workspace);
    };
  }, [workspace]);
}
