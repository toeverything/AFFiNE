import type { Workspace } from '@toeverything/infra';
import {
  DocsService,
  OnEvent,
  Service,
  WorkspaceInitialized,
} from '@toeverything/infra';

import {
  EditorSetting,
  type EditorSettingExt,
} from '../entities/editor-setting';

@OnEvent(WorkspaceInitialized, e => e.onWorkspaceInitialized)
export class EditorSettingService extends Service {
  editorSetting = this.framework.createEntity(
    EditorSetting
  ) as EditorSettingExt;

  onWorkspaceInitialized(workspace: Workspace) {
    // set default mode for new doc

    workspace.docCollection.slots.docCreated.on(docId => {
      const preferMode = this.editorSetting.settings$.value.newDocDefaultMode;
      const docsService = workspace.scope.get(DocsService);
      docsService.list.setPrimaryMode(docId, preferMode);
    });
    // never dispose, because this service always live longer than workspace
  }
}
