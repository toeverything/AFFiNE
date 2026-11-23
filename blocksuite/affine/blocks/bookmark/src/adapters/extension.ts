import type { ExtensionType } from '@blocksuite/store';

import { BookmarkBlockHtmlAdapterExtension } from './html.js';
import { BookmarkBlockMarkdownAdapterExtensions } from './markdown/index.js';
import { BookmarkBlockNotionHtmlAdapterExtension } from './notion-html.js';
import { BookmarkBlockPlainTextAdapterExtension } from './plain-text.js';

export const BookmarkBlockAdapterExtensions: ExtensionType[] = [
  BookmarkBlockHtmlAdapterExtension,
  BookmarkBlockMarkdownAdapterExtensions,
  BookmarkBlockNotionHtmlAdapterExtension,
  BookmarkBlockPlainTextAdapterExtension,
].flat();
