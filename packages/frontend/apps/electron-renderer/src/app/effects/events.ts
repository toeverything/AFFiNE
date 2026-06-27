import { buildWorkspaceSettingsPath } from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { DocsService } from '@affine/core/modules/doc';
import { JournalService } from '@affine/core/modules/journal';
import { LifecycleService } from '@affine/core/modules/lifecycle';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { ensureDefaultLocalWorkspace } from '@affine/core/utils/first-app-data';
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

  events?.applicationMenu.openInSettingModal(({ activeTab, scrollAnchor }) => {
    (async () => {
      using currentWorkspace = getCurrentWorkspace(frameworkProvider);
      if (currentWorkspace) {
        const { workspace } = currentWorkspace;
        const workspaceDialogService = workspace.scope.get(
          WorkspaceDialogService
        );
        // close all other dialogs first
        workspaceDialogService.closeAll();
        workspaceDialogService.open('setting', {
          activeTab: activeTab as unknown as SettingTab,
          scrollAnchor,
        });
        return;
      }

      try {
        const workspacesService = frameworkProvider.get(WorkspacesService);
        const ensuredWorkspace =
          await ensureDefaultLocalWorkspace(workspacesService);

        if (!ensuredWorkspace) {
          if (BUILD_CONFIG.isNative) {
            console.error('Failed to resolve a local workspace for settings');
            return;
          }
          window.location.replace('/');
          return;
        }

        window.location.replace(
          buildWorkspaceSettingsPath(ensuredWorkspace.meta.id, {
            tab: activeTab as SettingTab,
            scrollAnchor,
          })
        );
      } catch (err) {
        console.error(err);
        if (!BUILD_CONFIG.isNative) {
          window.location.replace('/');
        }
      }
    })().catch(console.error);
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
        const docsService = workspace.scope.get(DocsService);

        const page =
          type === 'default'
            ? docsService.createDoc()
            : docsService.createDoc({ primaryMode: type });
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
