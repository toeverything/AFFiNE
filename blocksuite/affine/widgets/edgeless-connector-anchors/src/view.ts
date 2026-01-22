import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { connectorAnchorsWidget } from '.';
import { effects } from './effects';

export class EdgelessConnectorAnchorsViewExtension extends ViewExtensionProvider {
  override name = 'affine-edgeless-connector-anchors-widget';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isEdgeless(context.scope)) {
      context.register(connectorAnchorsWidget);
    }
  }
}
