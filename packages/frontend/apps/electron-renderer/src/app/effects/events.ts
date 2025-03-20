import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { JournalService } from '@affine/core/modules/journal';
import { LifecycleService } from '@affine/core/modules/lifecycle';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { apis, events } from '@affine/electron-api';
import type { FrameworkProvider } from '@toeverything/infra';

import { setupRecordingEvents } from './recording';
import { getCurrentWorkspace } from './utils';

export function setupEvents(frameworkProvider: FrameworkProvider) {
  // setup application lifecycle events, and emit application start event
  window.addEventListener('focus', () => {
    frameworkProvider.get(LifecycleService).applicationFocus();
  });
  frameworkProvider.get(LifecycleService).applicationStart();
  window.addEventListener('unload', () => {
    frameworkProvider
      .get(DesktopApiService)
      .api.handler.ui.pingAppLayoutReady(false)
      .catch(console.error);
  });

  events?.applicationMenu.openAboutPageInSettingModal(() => {
    using currentWorkspace = getCurrentWorkspace(frameworkProvider);
    if (!currentWorkspace) {
      return;
    }
    const { workspace } = currentWorkspace;
    workspace.scope.get(WorkspaceDialogService).open('setting', {
      activeTab: 'about',
    });
  });

  events?.applicationMenu.onNewPageAction(type => {
    apis?.ui
      .isActiveTab()
      .then(isActive => {
        if (!isActive) {
          return;
        }
        using currentWorkspace = getCurrentWorkspace(frameworkProvider);
        if (!currentWorkspace) {
          return;
        }
        const { workspace } = currentWorkspace;
        const editorSettingService =
          frameworkProvider.get(EditorSettingService);
        const docsService = workspace.scope.get(DocsService);
        const editorSetting = editorSettingService.editorSetting;

        const docProps = {
          note: editorSetting.get('affine:note'),
        };
        const page = docsService.createDoc({ docProps, primaryMode: type });
        workspace.scope.get(WorkbenchService).workbench.openDoc(page.id);
      })
      .catch(err => {
        console.error(err);
      });
  });

  events?.applicationMenu.onOpenJournal(() => {
    using currentWorkspace = getCurrentWorkspace(frameworkProvider);
    if (!currentWorkspace) {
      return;
    }
    const { workspace, dispose } = currentWorkspace;

    const workbench = workspace.scope.get(WorkbenchService).workbench;
    const journalService = workspace.scope.get(JournalService);
    const docId = journalService.ensureJournalByDate(new Date()).id;
    workbench.openDoc(docId);

    dispose();
  });

  setupRecordingEvents(frameworkProvider);
}
