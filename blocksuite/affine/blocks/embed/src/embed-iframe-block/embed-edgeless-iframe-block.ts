import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { EmbedIframeBlockSchema } from '@blocksuite/affine-model';
import { Bound, clamp } from '@blocksuite/global/gfx';
import { toGfxBlockComponent } from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { EmbedIframeBlockComponent } from './embed-iframe-block';

export class EmbedEdgelessIframeBlockComponent extends toGfxBlockComponent(
  EmbedIframeBlockComponent
) {
  override selectedStyle$ = null;

  override blockDraggable = false;

  override accessor blockContainerStyles = {
    margin: '0',
    backgroundColor: 'transparent',
  };

  get edgelessSlots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.edgelessSlots.elementResizeStart.subscribe(() => {
      this.isResizing$.value = true;
    });

    this.edgelessSlots.elementResizeEnd.subscribe(() => {
      this.isResizing$.value = false;
    });
  }

  override renderGfxBlock() {
    const bound = Bound.deserialize(this.model.props.xywh$.value);
    const scale = this.model.props.scale$.value;
    const width = bound.w / scale;
    const height = bound.h / scale;
    const style = {
      width: `${width}px`,
      height: `${height}px`,
      transformOrigin: '0 0',
      transform: `scale(${scale})`,
    };

    return html`
      <div class="edgeless-embed-iframe-block" style=${styleMap(style)}>
        ${this.renderPageContent()}
      </div>
    `;
  }
}

export const EmbedIframeInteraction =
  GfxViewInteractionExtension<EmbedEdgelessIframeBlockComponent>(
    EmbedIframeBlockSchema.model.flavour,
    {
      resizeConstraint: {
        minWidth: 218,
        minHeight: 44,
        maxWidth: 3400,
        maxHeight: 2200,
      },

      handleResize: context => {
        const { model } = context;
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

            // update scale if resize is proportional
            if (lockRatio) {
              scale = newBound.w / originalRealWidth;
            }

            let newRealWidth = clamp(newBound.w / scale, minWidth, maxWidth);
            let newRealHeight = clamp(newBound.h / scale, minHeight, maxHeight);

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

      handleRotate: () => {
        return {
          beforeRotate(context) {
            context.set({
              rotatable: false,
            });
          },
        };
      },
    }
  );
