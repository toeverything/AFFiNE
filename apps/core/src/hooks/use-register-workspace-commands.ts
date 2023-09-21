import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useStore } from 'jotai';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import {
  registerAffineCreationCommands,
  registerAffineLayoutCommands,
  registerAffineSettingsCommands,
} from '../commands';
import { registerAffineNavigationCommands } from '../commands/affine-navigation';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import { useCurrentWorkspace } from './current/use-current-workspace';
import { useNavigateHelper } from './use-navigate-helper';

export function useRegisterWorkspaceCommands() {
  const store = useStore();
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const [currentWorkspace] = useCurrentWorkspace();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const navigationHelper = useNavigateHelper();
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      registerAffineNavigationCommands({
        store,
        t,
        workspace: currentWorkspace.blockSuiteWorkspace,
        navigationHelper,
      })
    );
    unsubs.push(registerAffineSettingsCommands({ store, t, theme }));
    unsubs.push(registerAffineLayoutCommands({ store, t }));
    unsubs.push(
      registerAffineCreationCommands({
        store,
        pageHelper: pageHelper,
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
  ]);
}
