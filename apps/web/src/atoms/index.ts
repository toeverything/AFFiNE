import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { Page } from '@blocksuite/store';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { WorkspaceAdapters } from '../adapters/workspace';
import type { CreateWorkspaceMode } from '../components/affine/create-workspace-modal';

const logger = new DebugLogger('web:atoms');

// workspace necessary atoms
// todo(himself65): move this to the workspace package
rootWorkspacesMetadataAtom.onMount = setAtom => {
  function createFirst(): RootWorkspaceMetadata[] {
    const Plugins = Object.values(WorkspaceAdapters).sort(
      (a, b) => a.loadPriority - b.loadPriority
    );

    return Plugins.flatMap(Plugin => {
      return Plugin.Events['app:init']?.().map(
        id =>
          ({
            id,
            flavour: Plugin.flavour,
          } satisfies RootWorkspaceMetadata)
      );
    }).filter((ids): ids is RootWorkspaceMetadata => !!ids);
  }

  const abortController = new AbortController();

  // next tick to make sure the hydration is correct
  const id = setTimeout(() => {
    setAtom(metadata => {
      if (abortController.signal.aborted) return metadata;
      if (
        metadata.length === 0 &&
        localStorage.getItem('is-first-open') === null
      ) {
        localStorage.setItem('is-first-open', 'false');
        const newMetadata = createFirst();
        logger.info('create first workspace', newMetadata);
        return newMetadata;
      }
      return metadata;
    });
  }, 0);

  if (environment.isDesktop) {
    // @ts-expect-error
    window.apis?.workspace.list().then(workspaceIDs => {
      if (abortController.signal.aborted) return;
      // @ts-expect-error
      const newMetadata = workspaceIDs.map(w => ({
        id: w[0],
        flavour: WorkspaceFlavour.LOCAL,
      }));
      setAtom(metadata => {
        return [
          ...metadata,
          // @ts-expect-error
          ...newMetadata.filter(m => !metadata.find(m2 => m2.id === m.id)),
        ];
      });
    });
  }

  return () => {
    clearTimeout(id);
    abortController.abort();
  };
};

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom<CreateWorkspaceMode>(false);
export const openQuickSearchModalAtom = atom(false);
export const openOnboardingModalAtom = atom(false);

export const openDisableCloudAlertModalAtom = atom(false);

export { workspacesAtom } from './root';

type View = {
  id: string;
  /**
   * @deprecated Use `mode` from `useWorkspacePreferredMode` instead.
   */
  mode: 'page' | 'edgeless';
};

export type WorkspaceRecentViews = Record<string, View[]>;

export const workspaceRecentViewsAtom = atomWithStorage<WorkspaceRecentViews>(
  'recentViews',
  {}
);

export type PreferredModeRecord = Record<Page['id'], 'page' | 'edgeless'>;
/**
 * @deprecated Use `useWorkspacePreferredMode` instead.
 */
export const workspacePreferredModeAtom = atomWithStorage<PreferredModeRecord>(
  'preferredMode',
  {}
);

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

export type PageModeOption = 'all' | 'page' | 'edgeless';
export const pageModeSelectAtom = atom<PageModeOption>('all');
