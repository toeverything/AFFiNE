import { ViewExtensionProvider } from '@blocksuite/affine-ext-loader';

import { effects } from './effects';

export class DocTitleViewExtension extends ViewExtensionProvider {
  override name = 'affine-doc-title-fragment';

  override effect() {
    super.effect();
    effects();
  }
}
