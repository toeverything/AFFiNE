import { atomWithSyncStorage } from '@affine/jotai';
import {
  rootCurrentEditorAtom,
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import type { Page } from '@blocksuite/store';
import { atom } from 'jotai';

// workspace necessary atoms
/**
 * @deprecated Use `rootCurrentWorkspaceIdAtom` directly instead.
 */
export const currentWorkspaceIdAtom = rootCurrentWorkspaceIdAtom;
/**
 * @deprecated Use `rootCurrentPageIdAtom` directly instead.
 */
export const currentPageIdAtom = rootCurrentPageIdAtom;
/**
 * @deprecated Use `rootCurrentEditorAtom` directly instead.
 */
export const currentEditorAtom = rootCurrentEditorAtom;

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

export { workspacesAtom } from './root';

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
