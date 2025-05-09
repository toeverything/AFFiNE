import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { toGfxBlockComponent } from '@blocksuite/std';
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

  override renderGfxBlock() {
    const style = this.model.props.style$.value;
    const width = EMBED_CARD_WIDTH[style];
    const height = EMBED_CARD_HEIGHT[style];
    const bound = this.model.elementBound;
    const scaleX = bound.w / width;
    const scaleY = bound.h / height;

    this.containerStyleMap = styleMap({
      width: `100%`,
      height: `100%`,
      transform: `scale(${scaleX}, ${scaleY})`,
      transformOrigin: '0 0',
    });

    return this.renderPageContent();
  }

  protected override accessor blockContainerStyles: StyleInfo = {
    height: '100%',
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-bookmark': BookmarkEdgelessBlockComponent;
  }
}
