import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { SlashMenuExtension } from './extensions';

export class SlashMenuViewExtension extends ViewExtensionProvider {
  override name = 'affine-slash-menu-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isMobile(context.scope)) return;
    context.register(SlashMenuExtension);
  }
}
