import { EmbedGithubBlockSchema } from '@blocksuite/affine-model';
import { BlockHtmlAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockHtmlAdapterMatcher } from '../../common/adapters/html.js';

export const embedGithubBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher(EmbedGithubBlockSchema.model.flavour);

export const EmbedGithubBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  embedGithubBlockHtmlAdapterMatcher
);
