import { createEmbedBlockPlainTextAdapterMatcher } from '@blocksuite/affine-block-embed';
import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import { BlockPlainTextAdapterExtension } from '@blocksuite/affine-shared/adapters';

export const bookmarkBlockPlainTextAdapterMatcher =
  createEmbedBlockPlainTextAdapterMatcher(BookmarkBlockSchema.model.flavour);

export const BookmarkBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(bookmarkBlockPlainTextAdapterMatcher);
