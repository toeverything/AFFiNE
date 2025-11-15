import type { TextElementModel } from '@blocksuite/affine-model';
import {
  GfxElementModelView,
  GfxViewInteractionExtension,
} from '@blocksuite/std/gfx';

import { mountTextElementEditor } from './edgeless-text-editor';
import { normalizeTextBound } from './element-renderer';

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

export const TextInteraction = GfxViewInteractionExtension<TextElementView>(
  TextElementView.type,
  {
    resizeConstraint: {
      lockRatio: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    },
    handleResize({ model }) {
      let initialFontSize = model.fontSize;
      return {
        onResizeStart(context) {
          const { handle } = context;

          context.default(context);

          if (handle === 'left' || handle === 'right') {
            model.stash('hasMaxWidth');
          }
          model.stash('fontSize');
        },
        onResizeMove(context) {
          const { handle, newBound, originalBound } = context;
          if (handle === 'left' || handle === 'right') {
            const {
              text: yText,
              fontFamily,
              fontSize,
              fontStyle,
              fontWeight,
              hasMaxWidth,
            } = model;
            // If the width of the text element has been changed by dragging,
            // We need to set hasMaxWidth to true for wrapping the text
            const normalizedBound = normalizeTextBound(
              {
                yText,
                fontFamily,
                fontSize,
                fontStyle,
                fontWeight,
                hasMaxWidth,
              },
              newBound,
              true
            );

            model.xywh = normalizedBound.serialize();
            model.hasMaxWidth = true;
          } else {
            model.xywh = newBound.serialize();
            model.fontSize = initialFontSize * (newBound.w / originalBound.w);
          }
        },
        onResizeEnd(context) {
          context.default(context);

          model.pop('fontSize');
          model.pop('hasMaxWidth');
        },
      };
    },
  }
);
