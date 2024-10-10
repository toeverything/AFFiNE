import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { I18nService } from '@affine/core/modules/i18n';
import { useI18n } from '@affine/i18n';
import type { AffineEditorContainer } from '@blocksuite/affine/presets';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useStore } from 'jotai';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

import {
  PreconditionStrategy,
  registerAffineCommand,
  registerAffineCreationCommands,
  registerAffineHelpCommands,
  registerAffineLanguageCommands,
  registerAffineLayoutCommands,
  registerAffineNavigationCommands,
  registerAffineSettingsCommands,
  registerAffineUpdatesCommands,
} from '../../commands';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { CreateWorkspaceDialogService } from '../../modules/create-workspace';
import { EditorSettingService } from '../../modules/editor-settting';
import { CMDKQuickSearchService } from '../../modules/quicksearch/services/cmdk';
import { useActiveBlocksuiteEditor } from './use-block-suite-editor';
import { useNavigateHelper } from './use-navigate-helper';

function hasLinkPopover(editor: AffineEditorContainer | null) {
  const textSelection = editor?.host?.std.selection.find('text');
  if (editor && textSelection && textSelection.from.length > 0) {
    const formatBar = editor.host?.querySelector('affine-format-bar-widget');
    if (formatBar) {
      return true;
    }
  }
  return false;
}

function registerCMDKCommand(
  service: CMDKQuickSearchService,
  editor: AffineEditorContainer | null
) {
  return registerAffineCommand({
    id: 'affine:show-quick-search',
    preconditionStrategy: PreconditionStrategy.Never,
    category: 'affine:general',
    keyBinding: {
      binding: '$mod+K',
      capture: true,
    },
    label: '',
    icon: '',
    run() {
      // Due to a conflict with the shortcut for creating a link after selecting text in blocksuite,
      // opening the quick search modal is disabled when link-popup is visitable.
      if (hasLinkPopover(editor)) {
        return;
      }
      service.toggle();
    },
  });
}

export function useRegisterWorkspaceCommands() {
  const store = useStore();
  const t = useI18n();
  const theme = useTheme();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const pageHelper = usePageHelper(currentWorkspace.docCollection);
  const navigationHelper = useNavigateHelper();
  const [editor] = useActiveBlocksuiteEditor();
  const cmdkQuickSearchService = useService(CMDKQuickSearchService);
  const editorSettingService = useService(EditorSettingService);
  const createWorkspaceDialogService = useService(CreateWorkspaceDialogService);
  const appSidebarService = useService(AppSidebarService);
  const i18n = useService(I18nService).i18n;

  useEffect(() => {
    const unsub = registerCMDKCommand(cmdkQuickSearchService, editor);

    return () => {
      unsub();
    };
  }, [cmdkQuickSearchService, editor]);

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
      editorSettingService,
    });

    return () => {
      unsub();
    };
  }, [editorSettingService, store, t, theme]);

  // register AffineLanguageCommands
  useEffect(() => {
    const unsub = registerAffineLanguageCommands({
      i18n,
      t,
    });

    return () => {
      unsub();
    };
  }, [i18n, t]);

  // register AffineLayoutCommands
  useEffect(() => {
    const unsub = registerAffineLayoutCommands({ t, appSidebarService });

    return () => {
      unsub();
    };
  }, [appSidebarService, store, t]);

  // register AffineCreationCommands
  useEffect(() => {
    const unsub = registerAffineCreationCommands({
      createWorkspaceDialogService,
      pageHelper: pageHelper,
      t,
    });

    return () => {
      unsub();
    };
  }, [store, pageHelper, t, createWorkspaceDialogService]);

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
