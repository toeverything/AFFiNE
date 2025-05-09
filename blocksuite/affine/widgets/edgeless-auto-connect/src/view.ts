import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { autoConnectWidget } from '.';
import { effects } from './effects';

export class EdgelessAutoConnectViewExtension extends ViewExtensionProvider {
  override name = 'affine-edgeless-auto-connect-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isEdgeless(context.scope)) {
      context.register(autoConnectWidget);
    }
  }
}
