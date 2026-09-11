import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';

import { boardWidget } from './blocks/board';
import { chartWidget } from './blocks/chart';
import { helloWidget } from './blocks/hello';
import { sketchWidget } from './blocks/sketch';
import { collectStoreExtensions } from './register-gfx-widget';

const whiteboardWidgets = [helloWidget, chartWidget, sketchWidget, boardWidget];

export class WhiteboardStoreExtension extends StoreExtensionProvider {
  override name = 'affine-whiteboard-store';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    for (const extension of collectStoreExtensions(whiteboardWidgets)) {
      context.register(extension);
    }
  }
}
