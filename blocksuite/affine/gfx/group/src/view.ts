import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { GroupElementView, GroupInteraction } from './element-view';
import { GroupInteractionExtension } from './interaction-ext';
import {
  GroupDomRendererExtension,
  GroupElementRendererExtension,
} from './renderer';
import { groupToolbarExtension } from './toolbar/config';

export class GroupViewExtension extends ViewExtensionProvider {
  override name = 'affine-group-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(GroupElementRendererExtension);
    context.register(GroupDomRendererExtension);
    context.register(GroupElementView);
    if (this.isEdgeless(context.scope)) {
      context.register(groupToolbarExtension);
      context.register(GroupInteraction);
      context.register(GroupInteractionExtension);
    }
  }
}
