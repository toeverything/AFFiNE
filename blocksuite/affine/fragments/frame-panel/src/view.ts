import { ViewExtensionProvider } from '@blocksuite/affine-ext-loader';

import { effects } from './effects';

export class FramePanelViewExtension extends ViewExtensionProvider {
  override name = 'affine-frame-panel-fragment';

  override effect() {
    super.effect();
    effects();
  }
}
