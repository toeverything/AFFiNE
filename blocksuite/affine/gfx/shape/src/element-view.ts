import { ShapeElementModel } from '@blocksuite/affine-model';
import {
  GfxElementModelView,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { normalizeShapeBound } from './element-renderer';
import { mountShapeTextEditor } from './text/edgeless-shape-text-editor';

export class ShapeElementView extends GfxElementModelView<ShapeElementModel> {
  static override type: string = 'shape';

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
  }

  private _initDblClickToEdit(): void {
    this.on('dblclick', () => {
      const edgeless = this.std.view.getBlock(this.std.store.root!.id);

      if (
        edgeless &&
        !this.model.isLocked() &&
        this.model instanceof ShapeElementModel
      ) {
        mountShapeTextEditor(this.model, edgeless);
      }
    });
  }
}

export const ShapeViewInteraction =
  GfxViewInteractionExtension<ShapeElementView>(ShapeElementView.type, {
    handleResize: () => {
      return {
        onResizeMove({ newBound, model }) {
          const normalizedBound = normalizeShapeBound(model, newBound);

          model.xywh = normalizedBound.serialize();
        },
      };
    },
  });
