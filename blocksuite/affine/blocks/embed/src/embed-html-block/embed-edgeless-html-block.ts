import { EmbedHtmlBlockSchema } from '@blocksuite/affine-model';

import { createEmbedEdgelessBlockInteraction } from '../common/embed-block-element.js';
import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedHtmlBlockComponent } from './embed-html-block.js';
import { EMBED_HTML_MIN_HEIGHT, EMBED_HTML_MIN_WIDTH } from './styles.js';

export class EmbedEdgelessHtmlBlockComponent extends toEdgelessEmbedBlock(
  EmbedHtmlBlockComponent
) {}

export const EmbedEdgelessHtmlBlockInteraction =
  createEmbedEdgelessBlockInteraction(EmbedHtmlBlockSchema.model.flavour, {
    resizeConstraint: {
      minWidth: EMBED_HTML_MIN_WIDTH,
      minHeight: EMBED_HTML_MIN_HEIGHT,
      lockRatio: false,
    },
  });
