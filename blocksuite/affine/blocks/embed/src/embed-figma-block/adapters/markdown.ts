import { EmbedFigmaBlockSchema } from '@blocksuite/affine-model';
import { BlockMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockMarkdownAdapterMatcher } from '../../common/adapters/markdown.js';

export const embedFigmaBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher(EmbedFigmaBlockSchema.model.flavour);

export const EmbedFigmaMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  embedFigmaBlockMarkdownAdapterMatcher
);
