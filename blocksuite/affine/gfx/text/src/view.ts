import type { TextElementModel } from '@blocksuite/affine-model';
import { GfxElementModelView } from '@blocksuite/block-std/gfx';

import { mountTextElementEditor } from './edgeless-text-editor';

export class TextElementView extends GfxElementModelView<TextElementModel> {
  static override type: string = 'text';

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
  }

  private _initDblClickToEdit(): void {
    this.on('dblclick', evt => {
      const edgeless = this.std.view.getBlock(this.std.store.root!.id);
      const [x, y] = this.gfx.viewport.toModelCoord(evt.x, evt.y);

      if (edgeless && !this.model.isLocked()) {
        mountTextElementEditor(this.model, edgeless, {
          x,
          y,
        });
      }
    });
  }
}
