import type { ShapeElementModel } from '@blocksuite/affine-model';
import { GfxElementModelView } from '@blocksuite/block-std/gfx';

import { mountShapeTextEditor } from './text/edgeless-shape-text-editor';

export class ShapeElementView extends GfxElementModelView<ShapeElementModel> {
  static override type: string = 'shape';

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
  }

  private _initDblClickToEdit(): void {
    const edgeless = this.std.view.getBlock(this.std.store.root!.id);

    this.on('dblclick', () => {
      if (edgeless && !this.model.isLocked()) {
        mountShapeTextEditor(this.model, edgeless);
      }
    });
  }
}
