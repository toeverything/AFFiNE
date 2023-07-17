import type { Workspace } from '@blocksuite/store';
import { type PassiveDocProvider } from '@blocksuite/store';
import {
  getActiveBlockSuiteWorkspaceAtom,
  workspacePassiveEffectWeakMap,
} from '@toeverything/plugin-infra/__internal__/workspace';
import { useAtomValue } from 'jotai/react';
import { useEffect } from 'react';

export function useStaticBlockSuiteWorkspace(id: string): Workspace {
  return useAtomValue(getActiveBlockSuiteWorkspaceAtom(id));
}

export function usePassiveWorkspaceEffect(workspace: Workspace) {
  useEffect(() => {
    if (workspacePassiveEffectWeakMap.get(workspace) === true) {
      return;
    }
    const providers = workspace.providers.filter(
      (provider): provider is PassiveDocProvider =>
        'passive' in provider && provider.passive === true
    );
    providers.forEach(provider => {
      provider.connect();
    });
    workspacePassiveEffectWeakMap.set(workspace, true);
    return () => {
      providers.forEach(provider => {
        provider.disconnect();
      });
      workspacePassiveEffectWeakMap.delete(workspace);
    };
  }, [workspace]);
}
