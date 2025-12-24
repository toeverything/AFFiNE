import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { EdgelessClipboardImageConfig } from './edgeless-clipboard-config';
import { effects } from './effects';
import { ImageEdgelessBlockInteraction } from './image-edgeless-block';
import { ImageBlockSpec } from './image-spec';

export class ImageViewExtension extends ViewExtensionProvider {
  override name = 'affine-image-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(ImageBlockSpec);
    if (this.isEdgeless(context.scope)) {
      context.register(EdgelessClipboardImageConfig);
      context.register(ImageEdgelessBlockInteraction);
    }
  }
}
