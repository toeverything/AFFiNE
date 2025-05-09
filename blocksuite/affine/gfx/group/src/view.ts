import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { GroupElementRendererExtension } from './element-renderer';
import { GroupElementView } from './element-view';
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
    context.register(GroupElementView);
    if (this.isEdgeless(context.scope)) {
      context.register(groupToolbarExtension);
    }
  }
}
