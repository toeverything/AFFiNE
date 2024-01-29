import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
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
import { useLanguageHelper } from './affine/use-language-helper';
import { useActiveBlocksuiteEditor } from './use-block-suite-editor';
import { useNavigateHelper } from './use-navigate-helper';

export function useRegisterWorkspaceCommands() {
  const store = useStore();
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const languageHelper = useLanguageHelper();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const navigationHelper = useNavigateHelper();
  const setPageListMode = useSetAtom(allPageModeSelectAtom);
  const [editor] = useActiveBlocksuiteEditor();

  // register AffineUpdatesCommands
  useEffect(() => {
    const unsub = registerAffineUpdatesCommands({
      store,
      t,
    });

    return () => {
      unsub();
    };
  }, [store, t]);

  // register AffineNavigationCommands
  useEffect(() => {
    const unsub = registerAffineNavigationCommands({
      store,
      t,
      workspace: currentWorkspace.blockSuiteWorkspace,
      navigationHelper,
      setPageListMode,
    });

    return () => {
      unsub();
    };
  }, [
    store,
    t,
    currentWorkspace.blockSuiteWorkspace,
    navigationHelper,
    setPageListMode,
  ]);

  // register AffineSettingsCommands
  useEffect(() => {
    const unsub = registerAffineSettingsCommands({
      store,
      t,
      theme,
      languageHelper,
      editor,
    });

    return () => {
      unsub();
    };
  }, [store, t, theme, languageHelper, editor]);

  // register AffineLayoutCommands
  useEffect(() => {
    const unsub = registerAffineLayoutCommands({ t, store });

    return () => {
      unsub();
    };
  }, [store, t]);

  // register AffineCreationCommands
  useEffect(() => {
    const unsub = registerAffineCreationCommands({
      store,
      pageHelper: pageHelper,
      t,
    });

    return () => {
      unsub();
    };
  }, [store, pageHelper, t]);

  // register AffineHelpCommands
  useEffect(() => {
    const unsub = registerAffineHelpCommands({
      store,
      t,
    });

    return () => {
      unsub();
    };
  }, [store, t]);
}
