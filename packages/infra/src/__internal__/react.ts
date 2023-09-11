import type { Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';

import {
  disablePassiveProviders,
  enablePassiveProviders,
  getActiveBlockSuiteWorkspaceAtom,
} from './workspace.js';

export function useStaticBlockSuiteWorkspace(id: string): Workspace {
  return useAtomValue(getActiveBlockSuiteWorkspaceAtom(id));
}

export function usePassiveWorkspaceEffect(workspace: Workspace) {
  useEffect(() => {
    enablePassiveProviders(workspace);
    return () => {
      disablePassiveProviders(workspace);
    };
  }, [workspace]);
}
