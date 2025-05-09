import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { scrollAnchoringWidget } from './index';

export class ScrollAnchoringViewExtension extends ViewExtensionProvider {
  override name = 'affine-scroll-anchoring-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(scrollAnchoringWidget);
  }
}
