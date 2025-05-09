import { createEmbedBlockHtmlAdapterMatcher } from '@blocksuite/affine-block-embed';
import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import { BlockHtmlAdapterExtension } from '@blocksuite/affine-shared/adapters';

export const bookmarkBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher(BookmarkBlockSchema.model.flavour);

export const BookmarkBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  bookmarkBlockHtmlAdapterMatcher
);
