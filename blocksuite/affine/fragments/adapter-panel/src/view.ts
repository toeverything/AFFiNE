import { ViewExtensionProvider } from '@blocksuite/affine-ext-loader';

import { effects } from './effects';

export class AdapterPanelViewExtension extends ViewExtensionProvider {
  override name = 'affine-adapter-panel-fragment';

  override effect() {
    super.effect();
    effects();
  }
}
