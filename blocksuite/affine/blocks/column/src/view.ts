import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { ColumnBlockSpec } from './column-block-config.js';
import { effects } from './effects.js';

export class ColumnViewExtension extends ViewExtensionProvider {
  override name = 'affine-column-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(ColumnBlockSpec);
  }
}
