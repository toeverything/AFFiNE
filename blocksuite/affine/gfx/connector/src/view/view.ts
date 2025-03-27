import type { ConnectorElementModel } from '@blocksuite/affine-model';
import {
  type DragEndContext,
  type DragMoveContext,
  type DragStartContext,
  GfxElementModelView,
} from '@blocksuite/block-std/gfx';

import { mountConnectorLabelEditor } from '../text/edgeless-connector-label-editor';

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

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
  }

  private _initDblClickToEdit(): void {
    this.on('dblclick', evt => {
      const edgeless = this.std.view.getBlock(this.std.store.root!.id);

      if (edgeless && !this.model.isLocked()) {
        mountConnectorLabelEditor(
          this.model,
          edgeless,
          this.gfx.viewport.toModelCoord(evt.x, evt.y)
        );
      }
    });
  }
}
