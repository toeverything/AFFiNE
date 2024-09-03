import { DocMode } from '@blocksuite/blocks';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { DocService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import { EditorScope } from '../scopes/editor';
import type { EditorSelector } from '../types';

export class Editor extends Entity<{
  defaultMode: DocMode;
  defaultEditorSelector?: EditorSelector;
}> {
  readonly scope = this.framework.createScope(EditorScope, {
    editor: this as Editor,
  });

  readonly mode$ = new LiveData(this.props.defaultMode);
  readonly selector$ = new LiveData<EditorSelector | undefined>(
    this.props.defaultEditorSelector
  );
  readonly doc = this.docService.doc;
  readonly isSharedMode =
    this.workspaceService.workspace.openOptions.isSharedMode;

  readonly editorContainer$ = new LiveData<AffineEditorContainer | null>(null);

  toggleMode() {
    this.mode$.next(
      this.mode$.value === 'edgeless' ? DocMode.Page : DocMode.Edgeless
    );
  }

  setMode(mode: DocMode) {
    this.mode$.next(mode);
  }

  setEditorContainer(editorContainer: AffineEditorContainer | null) {
    this.editorContainer$.next(editorContainer);
  }

  constructor(
    private readonly docService: DocService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }
}
