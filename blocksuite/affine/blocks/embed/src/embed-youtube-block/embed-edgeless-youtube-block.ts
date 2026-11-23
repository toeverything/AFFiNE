import { EmbedYoutubeBlockSchema } from '@blocksuite/affine-model';

import { createEmbedEdgelessBlockInteraction } from '../common/embed-block-element.js';
import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedYoutubeBlockComponent } from './embed-youtube-block.js';

export class EmbedEdgelessYoutubeBlockComponent extends toEdgelessEmbedBlock(
  EmbedYoutubeBlockComponent
) {}

export const EmbedYoutubeBlockInteraction = createEmbedEdgelessBlockInteraction(
  EmbedYoutubeBlockSchema.model.flavour
);
