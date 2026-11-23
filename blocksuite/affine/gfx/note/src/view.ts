import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { NoteTool } from './note-tool';
import { noteSeniorTool } from './toolbar/senior-tool';

export class NoteViewExtension extends ViewExtensionProvider {
  override name = 'affine-note-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(NoteTool);
    context.register(noteSeniorTool);
  }
}
