// guid -> Workspace
import type { ActiveDocProvider, Workspace } from '@blocksuite/store';
import type { PassiveDocProvider } from '@blocksuite/store';
import { useAtomValue } from 'jotai/react';
import type { Atom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import { useEffect } from 'react';

/**
 * DO NOT ACCESS THIS MAP IN PRODUCTION, OR YOU WILL BE FIRED
 */
export const INTERNAL_BLOCKSUITE_HASH_MAP = new Map<string, Workspace>([]);

const workspacePassiveAtomWeakMap = new WeakMap<
  Workspace,
  Atom<Promise<Workspace>>
>();

// Whether the workspace is active to use
const workspaceActiveWeakMap = new WeakMap<Workspace, boolean>();

// Whether the workspace has been enabled the passive effect (background)
const workspacePassiveEffectWeakMap = new WeakMap<Workspace, boolean>();

export function getWorkspace(id: string) {
  if (!INTERNAL_BLOCKSUITE_HASH_MAP.has(id)) {
    throw new Error('Workspace not found');
  }
  return INTERNAL_BLOCKSUITE_HASH_MAP.get(id) as Workspace;
}

export function getActiveBlockSuiteWorkspaceAtom(
  id: string
): Atom<Promise<Workspace>> {
  if (!INTERNAL_BLOCKSUITE_HASH_MAP.has(id)) {
    throw new Error('Workspace not found');
  }
  const workspace = INTERNAL_BLOCKSUITE_HASH_MAP.get(id) as Workspace;
  if (!workspacePassiveAtomWeakMap.has(workspace)) {
    const baseAtom = atom(async () => {
      if (workspaceActiveWeakMap.get(workspace) !== true) {
        const providers = workspace.providers.filter(
          (provider): provider is ActiveDocProvider =>
            'active' in provider && provider.active === true
        );
        for (const provider of providers) {
          provider.sync();
          // we will wait for the necessary providers to be ready
          await provider.whenReady;
        }
        workspaceActiveWeakMap.set(workspace, true);
      }
      return workspace;
    });
    workspacePassiveAtomWeakMap.set(workspace, baseAtom);
  }
  return workspacePassiveAtomWeakMap.get(workspace) as Atom<Promise<Workspace>>;
}

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
