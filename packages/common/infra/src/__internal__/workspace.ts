import type { ActiveDocProvider, Workspace } from '@blocksuite/store';
import type { PassiveDocProvider } from '@blocksuite/store';
import type { Atom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import { atomEffect } from 'jotai-effect';

/**
 * Map: guid -> Workspace
 */
export const INTERNAL_BLOCKSUITE_HASH_MAP = new Map<string, Workspace>([]);

const workspaceActiveAtomWeakMap = new WeakMap<
  Workspace,
  Atom<Promise<Workspace>>
>();

const workspaceActiveWeakMap = new WeakMap<Workspace, boolean>();
const workspaceEffectAtomWeakMap = new WeakMap<Workspace, Atom<void>>();

export async function waitForWorkspace(workspace: Workspace) {
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
    // timeout is INFINITE
    workspaceActiveWeakMap.set(workspace, true);
  }
}

export function getWorkspace(id: string) {
  if (!INTERNAL_BLOCKSUITE_HASH_MAP.has(id)) {
    throw new Error('Workspace not found');
  }
  return INTERNAL_BLOCKSUITE_HASH_MAP.get(id) as Workspace;
}

export function getBlockSuiteWorkspaceAtom(
  id: string
): [workspaceAtom: Atom<Promise<Workspace>>, workspaceEffectAtom: Atom<void>] {
  if (!INTERNAL_BLOCKSUITE_HASH_MAP.has(id)) {
    throw new Error('Workspace not found');
  }
  const workspace = INTERNAL_BLOCKSUITE_HASH_MAP.get(id) as Workspace;
  if (!workspaceActiveAtomWeakMap.has(workspace)) {
    const baseAtom = atom(async () => {
      await waitForWorkspace(workspace);
      return workspace;
    });
    workspaceActiveAtomWeakMap.set(workspace, baseAtom);
  }
  if (!workspaceEffectAtomWeakMap.has(workspace)) {
    const effectAtom = atomEffect(() => {
      const providers = workspace.providers.filter(
        (provider): provider is PassiveDocProvider =>
          'passive' in provider && provider.passive === true
      );
      providers.forEach(provider => {
        provider.connect();
      });
      return () => {
        providers.forEach(provider => {
          provider.disconnect();
        });
      };
    });
    workspaceEffectAtomWeakMap.set(workspace, effectAtom);
  }

  return [
    workspaceActiveAtomWeakMap.get(workspace) as Atom<Promise<Workspace>>,
    workspaceEffectAtomWeakMap.get(workspace) as Atom<void>,
  ];
}
