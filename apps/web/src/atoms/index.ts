import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

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
    window.apis?.workspace.list().then(workspaceIDs => {
      if (abortController.signal.aborted) return;
      const newMetadata = workspaceIDs.map(w => ({
        id: w[0],
        flavour: WorkspaceFlavour.LOCAL,
      }));
      setAtom(metadata => {
        return [
          ...metadata,
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

type PageMode = 'page' | 'edgeless';
type PageLocalSetting = {
  mode: PageMode;
};

type PartialPageLocalSettingWithPageId = Partial<PageLocalSetting> & {
  id: string;
};

const pageSettingsBaseAtom = atomWithStorage(
  'pageSettings',
  {} as Record<string, PageLocalSetting>
);

// readonly atom by design
export const pageSettingsAtom = atom(get => get(pageSettingsBaseAtom));

const recentPageSettingsBaseAtom = atomWithStorage<string[]>(
  'recentPageSettings',
  []
);

export const recentPageSettingsAtom = atom<PartialPageLocalSettingWithPageId[]>(
  get => {
    const recentPageIDs = get(recentPageSettingsBaseAtom);
    const pageSettings = get(pageSettingsAtom);
    return recentPageIDs.map(id => ({
      ...pageSettings[id],
      id,
    }));
  }
);

export const pageSettingFamily = atomFamily((pageId: string) =>
  atom(
    get => get(pageSettingsBaseAtom)[pageId],
    (
      get,
      set,
      patch:
        | Partial<PageLocalSetting>
        | ((prevSetting: PageLocalSetting | undefined) => void)
    ) => {
      set(recentPageSettingsBaseAtom, ids => {
        // pick 3 recent page ids
        return [...new Set([pageId, ...ids]).values()].slice(0, 3);
      });
      set(pageSettingsBaseAtom, settings => ({
        ...settings,
        [pageId]: {
          ...settings[pageId],
          ...(typeof patch === 'function' ? patch(settings[pageId]) : patch),
        },
      }));
    }
  )
);

export const setPageModeAtom = atom(
  void 0,
  (get, set, pageId: string, mode: PageMode) => {
    set(pageSettingFamily(pageId), { mode });
  }
);

export type PageModeOption = 'all' | 'page' | 'edgeless';
export const allPageModeSelectAtom = atom<PageModeOption>('all');
