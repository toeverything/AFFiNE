import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { MultiColumnContainerBlockSpec } from './multi-column-container-block-config';

export class MultiColumnContainerViewExtension extends ViewExtensionProvider {
  override name = 'affine-multi-column-container-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(MultiColumnContainerBlockSpec);
  }
}
