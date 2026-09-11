import { Bound, clamp } from '@blocksuite/affine/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/affine/std';
import { GfxViewInteractionExtension } from '@blocksuite/affine/std/gfx';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { BoardBlockComponent } from './board-block';
import { BoardBlockSchema } from './model';

export class BoardEdgelessBlockComponent extends toGfxBlockComponent(
  BoardBlockComponent
) {
  override renderGfxBlock() {
    const bound = Bound.deserialize(this.model.props.xywh$.value);
    const scale = this.model.props.scale$.value;
    const width = bound.w / scale;
    const height = bound.h / scale;

    return html`
      <div
        class="edgeless-wb-board"
        style=${styleMap({
          width: `${width}px`,
          height: `${height}px`,
          transformOrigin: '0 0',
          transform: `scale(${scale})`,
        })}
      >
        ${this.renderFrame(false)} ${this.renderSettings()}
      </div>
    `;
  }
}

export const BoardBlockInteraction =
  GfxViewInteractionExtension<BoardEdgelessBlockComponent>(
    BoardBlockSchema.model.flavour,
    {
      resizeConstraint: {
        minWidth: 360,
        minHeight: 240,
        maxWidth: 1920,
        maxHeight: 1200,
      },
      handleRotate() {
        return {
          beforeRotate(context) {
            context.set({ rotatable: false });
          },
        };
      },
      handleResize({ model }) {
        const initialScale = model.props.scale$.peek();

        return {
          onResizeStart(context) {
            context.default(context);
            model.stash('scale');
          },
          onResizeMove(context) {
            const { newBound, originalBound, lockRatio, constraint } = context;
            const { minWidth, maxWidth, minHeight, maxHeight } = constraint;
            let scale = initialScale;
            const originalRealWidth = originalBound.w / scale;

            if (lockRatio) {
              scale = newBound.w / originalRealWidth;
            }

            const newRealWidth = clamp(newBound.w / scale, minWidth, maxWidth);
            const newRealHeight = clamp(
              newBound.h / scale,
              minHeight,
              maxHeight
            );

            newBound.w = newRealWidth * scale;
            newBound.h = newRealHeight * scale;
            model.props.xywh = newBound.serialize();
            if (scale !== initialScale) {
              model.props.scale = scale;
            }
          },
          onResizeEnd(context) {
            context.default(context);
            model.pop('scale');
          },
        };
      },
    }
  );

declare global {
  interface HTMLElementTagNameMap {
    'wb-board-edgeless': BoardEdgelessBlockComponent;
  }
}
