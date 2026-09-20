import {
  EmbedYoutubeBlockSchema,
  youtubeUrlRegex,
} from '@blocksuite/affine-model';
import { BlockNotionHtmlAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockNotionHtmlAdapterMatcher } from '../../common/adapters/notion-html.js';

export const embedYoutubeBlockNotionHtmlAdapterMatcher =
  createEmbedBlockNotionHtmlAdapterMatcher(
    EmbedYoutubeBlockSchema.model.flavour,
    youtubeUrlRegex
  );

export const EmbedYoutubeBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(embedYoutubeBlockNotionHtmlAdapterMatcher);
