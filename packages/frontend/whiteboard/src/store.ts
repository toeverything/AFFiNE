import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';

import { helloWidget } from './blocks/hello';
import { collectStoreExtensions } from './register-gfx-widget';

const whiteboardWidgets = [helloWidget];

export class WhiteboardStoreExtension extends StoreExtensionProvider {
  override name = 'affine-whiteboard-store';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    for (const extension of collectStoreExtensions(whiteboardWidgets)) {
      context.register(extension);
    }
  }
}
