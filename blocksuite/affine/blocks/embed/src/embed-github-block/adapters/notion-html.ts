import { EmbedGithubBlockSchema } from '@blocksuite/affine-model';
import { BlockNotionHtmlAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockNotionHtmlAdapterMatcher } from '../../common/adapters/notion-html.js';
import { githubUrlRegex } from '../embed-github-model.js';

export const embedGithubBlockNotionHtmlAdapterMatcher =
  createEmbedBlockNotionHtmlAdapterMatcher(
    EmbedGithubBlockSchema.model.flavour,
    githubUrlRegex
  );

export const EmbedGithubBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(embedGithubBlockNotionHtmlAdapterMatcher);
