import { Scope } from '@toeverything/infra';

import type { Editor } from '../entities/editor';

export class EditorScope extends Scope<{
  editor: Editor;
}> {}
