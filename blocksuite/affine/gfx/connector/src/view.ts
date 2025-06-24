import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { ConnectionOverlay } from './connector-manager';
import { ConnectorTool } from './connector-tool';
import { effects } from './effects';
import { ConnectorElementRendererExtension } from './element-renderer';
import { ConnectorDomRendererExtension } from './element-renderer/connector-dom';
import { ConnectorFilter } from './element-transform';
import { connectorToolbarExtension } from './toolbar/config';
import { connectorQuickTool } from './toolbar/quick-tool';
import { ConnectorElementView, ConnectorInteraction } from './view/view';

export class ConnectorViewExtension extends ViewExtensionProvider {
  override name = 'affine-connector-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(ConnectorElementView);
    context.register(ConnectorElementRendererExtension);
    context.register(ConnectorDomRendererExtension);
    if (this.isEdgeless(context.scope)) {
      context.register(ConnectorTool);
      context.register(ConnectorFilter);
      context.register(connectorQuickTool);
      context.register(connectorToolbarExtension);
      context.register(ConnectionOverlay);
      context.register(ConnectorInteraction);
    }
  }
}
