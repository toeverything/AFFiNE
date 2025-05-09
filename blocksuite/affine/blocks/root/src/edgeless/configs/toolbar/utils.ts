import type { ToolbarContext } from '@blocksuite/affine-shared/services';

import { EdgelessRootBlockComponent } from '../..';

// TODO(@fundon): it should be simple
export function getEdgelessWith(ctx: ToolbarContext) {
  const rootModel = ctx.store.root;
  if (!rootModel) return;

  const edgeless = ctx.view.getBlock(rootModel.id);
  if (!ctx.matchBlock(edgeless, EdgelessRootBlockComponent)) {
    console.error('edgeless view is not found.');
    return;
  }

  return edgeless;
}
