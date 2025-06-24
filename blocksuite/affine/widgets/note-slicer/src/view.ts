import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { noteSlicerWidget } from './note-slicer';

export class NoteSlicerViewExtension extends ViewExtensionProvider {
  override name = 'affine-note-slicer-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isEdgeless(context.scope)) {
      context.register(noteSlicerWidget);
    }
  }
}
