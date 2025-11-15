import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { edgelessToolbarWidget } from './edgeless-toolbar';
import { effects } from './effects';

export class EdgelessToolbarViewExtension extends ViewExtensionProvider {
  override name = 'affine-edgeless-toolbar-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isEdgeless(context.scope)) {
      context.register(edgelessToolbarWidget);
    }
  }
}
