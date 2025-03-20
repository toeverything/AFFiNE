import type { ConnectorElementModel } from '@blocksuite/affine-model';
import {
  type DragEndContext,
  type DragMoveContext,
  type DragStartContext,
  GfxElementModelView,
} from '@blocksuite/block-std/gfx';

export class ConnectorElementView extends GfxElementModelView<ConnectorElementModel> {
  static override type = 'connector';

  override onDragStart = (context: DragStartContext) => {
    super.onDragStart(context);
    this.model.stash('labelXYWH');
  };

  override onDragEnd = (context: DragEndContext) => {
    super.onDragEnd(context);
    this.model.stash('labelXYWH');
  };

  override onDragMove = (context: DragMoveContext) => {
    const { dx, dy, currentBound } = context;

    this.model.moveTo(currentBound.moveDelta(dx, dy));
  };
}
