import { GroupElementModel } from '@blocksuite/affine-model';
import {
  GfxElementModelView,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

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

export const GroupInteraction = GfxViewInteractionExtension<GroupElementView>(
  GroupElementView.type,
  {
    handleResize(context) {
      const empty = () => {};
      context.model.descendantElements.forEach(elm => {
        if (elm instanceof GroupElementModel) {
          return;
        }

        context.add(elm);
      });
      context.delete(context.model);

      return {
        onResizeStart: empty,
        onResizeMove: empty,
        onResizeEnd: empty,
      };
    },
  }
);
