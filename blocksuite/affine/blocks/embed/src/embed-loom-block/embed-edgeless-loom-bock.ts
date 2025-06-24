import { EmbedLoomBlockSchema } from '@blocksuite/affine-model';

import { createEmbedEdgelessBlockInteraction } from '../common/embed-block-element.js';
import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedLoomBlockComponent } from './embed-loom-block.js';

export class EmbedEdgelessLoomBlockComponent extends toEdgelessEmbedBlock(
  EmbedLoomBlockComponent
) {}

export const EmbedLoomBlockInteraction = createEmbedEdgelessBlockInteraction(
  EmbedLoomBlockSchema.model.flavour
);
