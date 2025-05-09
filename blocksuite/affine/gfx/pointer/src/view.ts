import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { defaultQuickTool } from './quick-tool/quick-tool';
import { SnapExtension } from './snap/snap-manager';
import { SnapOverlay } from './snap/snap-overlay';
import { EmptyTool, PanTool } from './tools';

export class PointerViewExtension extends ViewExtensionProvider {
  override name = 'affine-pointer-gfx';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(EmptyTool);
    context.register(PanTool);
    if (this.isEdgeless(context.scope)) {
      context.register(defaultQuickTool);
      context.register(SnapExtension);
      context.register(SnapOverlay);
    }
  }
}
