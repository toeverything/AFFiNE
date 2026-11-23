import { EmbedGithubBlockSchema } from '@blocksuite/affine-model';

import { createEmbedEdgelessBlockInteraction } from '../common/embed-block-element.js';
import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedGithubBlockComponent } from './embed-github-block.js';

export class EmbedEdgelessGithubBlockComponent extends toEdgelessEmbedBlock(
  EmbedGithubBlockComponent
) {}

export const EmbedGithubBlockInteraction = createEmbedEdgelessBlockInteraction(
  EmbedGithubBlockSchema.model.flavour
);
