import { DebugLogger } from '@affine/debug';
import { assertExists } from '@blocksuite/store';
import { atom, createStore } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { unstable_batchedUpdates } from 'react-dom';

import { WorkspacePlugins } from '../plugins';
import { RemWorkspace, RemWorkspaceFlavour } from '../shared';

// workspace necessary atoms
export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
// If the workspace is locked, it means that the user maybe updating the workspace
//  from local to remote or vice versa
export const workspaceLockAtom = atom(false);
export async function lockMutex(fn: () => Promise<unknown>) {
  if (jotaiStore.get(workspaceLockAtom)) {
    throw new Error('Workspace is locked');
  }
  unstable_batchedUpdates(() => {
    jotaiStore.set(workspaceLockAtom, true);
  });
  await fn();
  unstable_batchedUpdates(() => {
    jotaiStore.set(workspaceLockAtom, false);
  });
}

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

export const jotaiStore = createStore();

type JotaiWorkspace = {
  id: string;
  flavour: RemWorkspaceFlavour;
};

const logger = new DebugLogger('jotai');

export const jotaiWorkspacesAtom = atomWithStorage<JotaiWorkspace[]>(
  'jotai-workspaces',
  []
);

jotaiWorkspacesAtom.onMount = set => {
  logger.info('mount');
  const controller = new AbortController();
  const lists = Object.values(WorkspacePlugins)
    .sort((a, b) => a.loadPriority - b.loadPriority)
    .map(({ CRUD }) => CRUD.list);
  async function fetch() {
    const items = [];
    for (const list of lists) {
      try {
        const item = await list();
        items.push(...item.map(x => ({ id: x.id, flavour: x.flavour })));
      } catch (e) {
        logger.error('list data error:', e);
      }
    }
    if (controller.signal.aborted) {
      return;
    }
    set([...items]);
    logger.info('mount first data:', items);
  }
  fetch();
  return () => {
    controller.abort();
    logger.info('unmount');
  };
};

export const workspacesAtom = atom<Promise<RemWorkspace[]>>(async get => {
  const flavours: string[] = Object.values(WorkspacePlugins).map(
    plugin => plugin.flavour
  );
  const jotaiWorkspaces = get(jotaiWorkspacesAtom).filter(workspace =>
    flavours.includes(workspace.flavour)
  );
  const workspaces = await Promise.all(
    jotaiWorkspaces.map(workspace => {
      const plugin =
        WorkspacePlugins[workspace.flavour as keyof typeof WorkspacePlugins];
      assertExists(plugin);
      const { CRUD } = plugin;
      return CRUD.get(workspace.id);
    })
  );
  return workspaces.filter(workspace => workspace !== null) as RemWorkspace[];
});
