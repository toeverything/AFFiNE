import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import {
  AttachmentBlockSchema,
  AttachmentBlockStyles,
} from '@blocksuite/affine-model';
import { EMBED_CARD_WIDTH } from '@blocksuite/affine-shared/consts';
import { toGfxBlockComponent } from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { styleMap } from 'lit/directives/style-map.js';

import { AttachmentBlockComponent } from './attachment-block.js';

export class AttachmentEdgelessBlockComponent extends toGfxBlockComponent(
  AttachmentBlockComponent
) {
  override blockDraggable = false;

  get slots() {
    return this.std.get(EdgelessLegacySlotIdentifier);
  }

  override onClick(_: MouseEvent) {
    return;
  }

  override renderGfxBlock() {
    const { style$ } = this.model.props;
    const cardStyle = style$.value ?? AttachmentBlockStyles[1];
    const width = EMBED_CARD_WIDTH[cardStyle];
    const bound = this.model.elementBound;
    const scale = bound.w / width;

    this.containerStyleMap = styleMap({
      width: `${width}px`,
      height: `${bound.h / scale}px`,
      transform: `scale(${scale})`,
      transformOrigin: '0 0',
      overflow: 'hidden',
    });

    return this.renderPageContent();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-attachment': AttachmentEdgelessBlockComponent;
  }
}

export const AttachmentBlockInteraction = GfxViewInteractionExtension(
  AttachmentBlockSchema.model.flavour,
  {
    resizeConstraint: {
      lockRatio: true,
    },
    handleRotate: () => {
      return {
        beforeRotate: context => {
          context.set({
            rotatable: false,
          });
        },
      };
    },
  }
);
