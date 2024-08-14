import type { DocMode } from '@blocksuite/blocks';
import type { DocService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import { EditorScope } from '../scopes/editor';

export class Editor extends Entity<{ defaultMode: DocMode }> {
  readonly scope = this.framework.createScope(EditorScope, {
    editor: this as Editor,
  });

  readonly mode$ = new LiveData(this.props.defaultMode);
  readonly doc = this.docService.doc;
  readonly isSharedMode =
    this.workspaceService.workspace.openOptions.isSharedMode;

  toggleMode() {
    this.mode$.next(this.mode$.value === 'edgeless' ? 'page' : 'edgeless');
  }

  setMode(mode: DocMode) {
    this.mode$.next(mode);
  }

  constructor(
    private readonly docService: DocService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }
}
