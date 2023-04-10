import { atomWithSyncStorage } from '@affine/jotai';
import { jotaiWorkspacesAtom } from '@affine/workspace/atom';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { EditorContainer } from '@blocksuite/editor';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { atom } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';

import { WorkspacePlugins } from '../plugins';
import type { AllWorkspace } from '../shared';

function getWorkspaceIdFromPathname(pathname?: string) {
  if (pathname?.startsWith('/')) {
    const paths = pathname.split('/');
    if (paths.length > 3 && paths[1] === 'workspace') {
      return paths[2];
    }
  }
  return null;
}

// workspace necessary atoms
export const currentWorkspaceIdAtom = (() => {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : '';
  return atom(getWorkspaceIdFromPathname(pathname));
})();

export const currentPageIdAtom = atom<string | null>(null);
export const currentEditorAtom = atom<Readonly<EditorContainer> | null>(null);

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

const workspaceFlavourSelector = (id: string) =>
  selectAtom(
    jotaiWorkspacesAtom,
    workspaces => workspaces.find(workspace => workspace.id === id)?.flavour
  );

// id -> flavour (atom)
const workspaceFlavourAtom = atomFamily((id: string) => {
  return atom(get => {
    const flavour = get(workspaceFlavourSelector(id));
    return flavour;
  });
});

export const workspaceByIdAtomFamily2 = atomFamily((id?: string | null) => {
  const localValuePromise = (async () => {
    if (!id) return null;
    // load from local first, then from cloud on mount
    const plugin = WorkspacePlugins.local;
    assertExists(plugin);
    const { CRUD } = plugin;
    const workspace = (await CRUD.get(id)) as AllWorkspace;
    console.log('workspaceByIdAtomFamily', id, workspace);
    return workspace;
  })();

  const baseAtom = atom(localValuePromise);

  const anAtom = atom(
    get => get(baseAtom),
    async (get, set, action: 'sync') => {
      if (!id) return null;
      if (action === 'sync') {
        const flavour = get(workspaceFlavourAtom(id));
        if (flavour === WorkspaceFlavour.AFFINE) {
          const { CRUD } = WorkspacePlugins.affine;
          const cloudValue = await CRUD.get(id);
          if (cloudValue) {
            set(baseAtom, Promise.resolve(cloudValue));
          }
        }
      }
    }
  );

  anAtom.onMount = set => {
    set('sync');
  };

  return atom(get => get(anAtom));
});

export const workspaceByIdAtomFamily = atomFamily((id?: string | null) => {
  const getValue = async (flavour: WorkspaceFlavour, local: boolean) => {
    if (!id) return null;
    // load from local first, then from cloud on mount
    const plugin = WorkspacePlugins[flavour];
    assertExists(plugin);
    const { CRUD } = plugin;
    const workspace = (await CRUD.get(id, { local })) as AllWorkspace;
    // console.log('workspaceByIdAtomFamily', id, workspace, local);
    return workspace;
  };

  const baseAtom = atom<Promise<AllWorkspace | null>>(Promise.resolve(null));

  const anAtom = atom(
    get => get(baseAtom),
    async (get, set, action: 'mount') => {
      if (!id) return null;
      if (action === 'mount') {
        const flavour = get(workspaceFlavourAtom(id));

        if (!flavour) return;

        set(baseAtom, getValue(flavour, true));

        if (flavour === WorkspaceFlavour.AFFINE) {
          const cloudValue = await getValue(flavour, false);
          if (cloudValue) {
            set(baseAtom, Promise.resolve(cloudValue));
          }
        }
      }
    }
  );

  anAtom.onMount = set => {
    set('mount');
  };

  return atom(get => get(anAtom));
});

type View = { id: string; mode: 'page' | 'edgeless' };

export type WorkspaceRecentViews = Record<string, View[]>;

export const workspaceRecentViewsAtom =
  atomWithSyncStorage<WorkspaceRecentViews>('recentViews', {});

export type PreferredModeRecord = Record<Page['id'], 'page' | 'edgeless'>;
export const workspacePreferredModeAtom =
  atomWithSyncStorage<PreferredModeRecord>('preferredMode', {});

export const workspaceRecentViresWriteAtom = atom<null, [string, View], View[]>(
  null,
  (get, set, id, value) => {
    const record = get(workspaceRecentViewsAtom);
    if (Array.isArray(record[id])) {
      const idx = record[id].findIndex(view => view.id === value.id);
      if (idx !== -1) {
        record[id].splice(idx, 1);
      }
      record[id] = [value, ...record[id]];
    } else {
      record[id] = [value];
    }

    record[id] = record[id].slice(0, 3);
    set(workspaceRecentViewsAtom, { ...record });
    return record[id];
  }
);
