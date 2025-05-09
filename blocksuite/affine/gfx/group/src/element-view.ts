import type { GroupElementModel } from '@blocksuite/affine-model';
import { GfxElementModelView } from '@blocksuite/std/gfx';

import { mountGroupTitleEditor } from './text/edgeless-group-title-editor';

export class GroupElementView extends GfxElementModelView<GroupElementModel> {
  static override type: string = 'group';

  override onCreated(): void {
    super.onCreated();

    this._initDblClickToEdit();
  }

  private _initDblClickToEdit(): void {
    this.on('dblclick', () => {
      const rootId = this.std.store.root?.id;
      if (!rootId) {
        console.error(
          'GroupElementView: rootId is not found when dblclick to edit'
        );
        return;
      }
      const edgeless = this.std.view.getBlock(rootId);

      if (edgeless && !this.model.isLocked()) {
        mountGroupTitleEditor(this.model, edgeless);
      }
    });
  }
}
