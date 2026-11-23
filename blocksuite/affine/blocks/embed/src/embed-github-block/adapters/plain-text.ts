import { EmbedGithubBlockSchema } from '@blocksuite/affine-model';
import { BlockPlainTextAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockPlainTextAdapterMatcher } from '../../common/adapters/plain-text.js';

export const embedGithubBlockPlainTextAdapterMatcher =
  createEmbedBlockPlainTextAdapterMatcher(EmbedGithubBlockSchema.model.flavour);

export const EmbedGithubBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(embedGithubBlockPlainTextAdapterMatcher);
