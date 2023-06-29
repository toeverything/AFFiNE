import { DebugLogger } from '@affine/debug';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import type { RootWorkspaceMetadataV2 } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

import { WorkspaceAdapters } from '../adapters/workspace';
import type { CreateWorkspaceMode } from '../components/affine/create-workspace-modal';

const logger = new DebugLogger('web:atoms');

// workspace necessary atoms
// todo(himself65): move this to the workspace package
rootWorkspacesMetadataAtom.onMount = setAtom => {
  function createFirst(): RootWorkspaceMetadataV2[] {
    const Plugins = Object.values(WorkspaceAdapters).sort(
      (a, b) => a.loadPriority - b.loadPriority
    );

    return Plugins.flatMap(Plugin => {
      return Plugin.Events['app:init']?.().map(
        id =>
          ({
            id,
            flavour: Plugin.flavour,
            // new workspace should all support sub-doc feature
            version: WorkspaceVersion.SubDoc,
          } satisfies RootWorkspaceMetadataV2)
      );
    }).filter((ids): ids is RootWorkspaceMetadataV2 => !!ids);
  }

  const abortController = new AbortController();

  if (!environment.isServer) {
    // next tick to make sure the hydration is correct
    setTimeout(() => {
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
  }

  if (environment.isDesktop && runtimeConfig.enableSQLiteProvider) {
    window.apis?.workspace
      .list()
      .then(workspaceIDs => {
        if (abortController.signal.aborted) return;
        const newMetadata = workspaceIDs.map(w => ({
          id: w[0],
          flavour: WorkspaceFlavour.LOCAL,
          version: undefined,
        }));
        setAtom(metadata => {
          return [
            ...metadata,
            ...newMetadata.filter(m => !metadata.find(m2 => m2.id === m.id)),
          ];
        });
      })
      .catch(err => {
        console.error(err);
      });
  }

  return () => {
    abortController.abort();
  };
};

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom<CreateWorkspaceMode>(false);
export const openQuickSearchModalAtom = atom(false);
export const openOnboardingModalAtom = atom(false);
export const openSettingModalAtom = atom(false);

export const openDisableCloudAlertModalAtom = atom(false);

export { workspacesAtom } from './root';

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
