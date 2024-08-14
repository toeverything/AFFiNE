import type { DocMode } from '@blocksuite/blocks';
import { Service } from '@toeverything/infra';

import { Editor } from '../entities/editor';

export class EditorsService extends Service {
  createEditor(defaultMode: DocMode) {
    return this.framework.createEntity(Editor, { defaultMode });
  }
}
