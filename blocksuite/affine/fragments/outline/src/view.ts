import { ViewExtensionProvider } from '@blocksuite/affine-ext-loader';

import { effects } from './effects';

export class OutlineViewExtension extends ViewExtensionProvider {
  override name = 'affine-outline-fragment';

  override effect() {
    super.effect();
    effects();
  }
}
