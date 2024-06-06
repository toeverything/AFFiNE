import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { AffineEditorContainer } from '@blocksuite/presets';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useStore } from 'jotai';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import {
  PreconditionStrategy,
  registerAffineCommand,
  registerAffineCreationCommands,
  registerAffineHelpCommands,
  registerAffineLayoutCommands,
  registerAffineNavigationCommands,
  registerAffineSettingsCommands,
  registerAffineUpdatesCommands,
} from '../commands';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import { QuickSearchService } from '../modules/cmdk';
import { useLanguageHelper } from './affine/use-language-helper';
import { useActiveBlocksuiteEditor } from './use-block-suite-editor';
import { useNavigateHelper } from './use-navigate-helper';

function hasLinkPopover(editor: AffineEditorContainer | null) {
  const textSelection = editor?.host?.std.selection.find('text');
  if (textSelection && textSelection.from.length > 0) {
    const linkPopup = document.querySelector('link-popup');
    if (linkPopup) {
      return true;
    }
  }
  return false;
}

function registerCMDKCommand(
  qsService: QuickSearchService,
  editor: AffineEditorContainer | null
) {
  return registerAffineCommand({
    id: 'affine:show-quick-search',
    preconditionStrategy: PreconditionStrategy.Never,
    category: 'affine:general',
    keyBinding: {
      binding: '$mod+K',
    },
    label: '',
    icon: '',
    run() {
      // Due to a conflict with the shortcut for creating a link after selecting text in blocksuite,
      // opening the quick search modal is disabled when link-popup is visitable.
      if (hasLinkPopover(editor)) {
        return;
      }
      qsService.quickSearch.toggle();
    },
  });
}

export function useRegisterWorkspaceCommands() {
  const store = useStore();
  const t = useAFFiNEI18N();
  const theme = useTheme();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const languageHelper = useLanguageHelper();
  const pageHelper = usePageHelper(currentWorkspace.docCollection);
  const navigationHelper = useNavigateHelper();
  const [editor] = useActiveBlocksuiteEditor();
  const quickSearch = useService(QuickSearchService);

  useEffect(() => {
    const unsub = registerCMDKCommand(quickSearch, editor);

    return () => {
      unsub();
    };
  }, [editor, quickSearch]);

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
      docCollection: currentWorkspace.docCollection,
      navigationHelper,
    });

    return () => {
      unsub();
    };
  }, [store, t, currentWorkspace.docCollection, navigationHelper]);

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
