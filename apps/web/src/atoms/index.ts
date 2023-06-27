import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

import type { CreateWorkspaceMode } from '../components/affine/create-workspace-modal';

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
