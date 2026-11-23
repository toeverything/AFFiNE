import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { toGfxBlockComponent } from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

import { BookmarkBlockComponent } from './bookmark-block.js';

export class BookmarkEdgelessBlockComponent extends toGfxBlockComponent(
  BookmarkBlockComponent
) {
  override selectedStyle$ = null;

  override blockDraggable = false;

  override getRenderingRect() {
    const elementBound = this.model.elementBound;
    const style = this.model.props.style$.value;

    return {
      x: elementBound.x,
      y: elementBound.y,
      w: EMBED_CARD_WIDTH[style],
      h: EMBED_CARD_HEIGHT[style],
      zIndex: this.toZIndex(),
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.disposables.add(
      this.gfx.selection.slots.updated.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  override renderGfxBlock() {
    const style = this.model.props.style$.value;
    const width = EMBED_CARD_WIDTH[style];
    const height = EMBED_CARD_HEIGHT[style];
    const bound = this.model.elementBound;
    const scaleX = bound.w / width;
    const scaleY = bound.h / height;
    const isSelected = this.gfx.selection.has(this.model.id);

    this.containerStyleMap = styleMap({
      width: `100%`,
      height: `100%`,
      transform: `scale(${scaleX}, ${scaleY})`,
      transformOrigin: '0 0',
      pointerEvents: isSelected ? 'auto' : 'none',
    });

    return this.renderPageContent();
  }

  protected override accessor blockContainerStyles: StyleInfo = {
    height: '100%',
  };
}

export const BookmarkBlockInteraction = GfxViewInteractionExtension(
  BookmarkBlockSchema.model.flavour,
  {
    resizeConstraint: {
      lockRatio: true,
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

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-bookmark': BookmarkEdgelessBlockComponent;
  }
}
