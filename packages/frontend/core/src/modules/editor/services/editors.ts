import type { DocMode } from '@blocksuite/blocks';
import { Service } from '@toeverything/infra';

import { Editor } from '../entities/editor';
import type { EditorSelector } from '../types';

export class EditorsService extends Service {
  createEditor(defaultMode: DocMode, defaultEditorSelector?: EditorSelector) {
    return this.framework.createEntity(Editor, {
      defaultMode,
      defaultEditorSelector,
    });
  }
}
