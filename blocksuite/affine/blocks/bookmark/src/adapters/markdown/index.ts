import type { ExtensionType } from '@blocksuite/store';

import { BookmarkBlockMarkdownAdapterExtension } from './markdown.js';
import { BookmarkBlockMarkdownPreprocessorExtension } from './preprocessor.js';

export * from './markdown.js';
export * from './preprocessor.js';

export const BookmarkBlockMarkdownAdapterExtensions: ExtensionType[] = [
  BookmarkBlockMarkdownPreprocessorExtension,
  BookmarkBlockMarkdownAdapterExtension,
];
