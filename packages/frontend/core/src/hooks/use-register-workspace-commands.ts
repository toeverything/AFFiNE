import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom, useStore } from 'jotai';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import { allPageModeSelectAtom } from '../atoms';
import {
  registerAffineCreationCommands,
  registerAffineHelpCommands,
  registerAffineLayoutCommands,
  registerAffineNavigationCommands,
  registerAffineSettingsCommands,
  registerAffineUpdatesCommands,
} from '../commands';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import { useAppSettingHelper } from './affine/use-app-setting-helper';
import { useLanguageHelper } from './affine/use-language-helper';
import { useSidebarStatus } from './affine/use-sidebar-status';
import { useCurrentWorkspace } from './current/use-current-workspace';
import { useNavigateHelper } from './use-navigate-helper';

export function useRegisterWorkspaceCommands() {
  const store = useStore();
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const [currentWorkspace] = useCurrentWorkspace();
  const languageHelper = useLanguageHelper();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const navigationHelper = useNavigateHelper();
  const [pageListMode, setPageListMode] = useAtom(allPageModeSelectAtom);
  const sidebarStatus = useSidebarStatus();
  const appSettingHelper = useAppSettingHelper();
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      registerAffineUpdatesCommands({
        store,
        t,
      })
    );
    unsubs.push(
      registerAffineNavigationCommands({
        store,
        t,
        workspace: currentWorkspace.blockSuiteWorkspace,
        navigationHelper,
        pageListMode,
        setPageListMode,
      })
    );
    unsubs.push(
      registerAffineSettingsCommands({
        store,
        t,
        theme,
        languageHelper,
        appSettingHelper,
      })
    );
    unsubs.push(registerAffineLayoutCommands({ t, sidebarStatus }));
    unsubs.push(
      registerAffineCreationCommands({
        store,
        pageHelper: pageHelper,
        t,
      })
    );
    unsubs.push(
      registerAffineHelpCommands({
        store,
        t,
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [
    store,
    pageHelper,
    t,
    theme,
    currentWorkspace.blockSuiteWorkspace,
    navigationHelper,
    pageListMode,
    setPageListMode,
    languageHelper,
    sidebarStatus,
    appSettingHelper,
  ]);
}
