import type { ExtensionType } from '@blocksuite/store';

import { DatabaseBlockHtmlAdapterExtension } from './html.js';
import { DatabaseBlockMarkdownAdapterExtension } from './markdown.js';
import { DatabaseBlockNotionHtmlAdapterExtension } from './notion-html.js';
import { DatabaseBlockPlainTextAdapterExtension } from './plain-text.js';

export const DatabaseBlockAdapterExtensions: ExtensionType[] = [
  DatabaseBlockHtmlAdapterExtension,
  DatabaseBlockMarkdownAdapterExtension,
  DatabaseBlockNotionHtmlAdapterExtension,
  DatabaseBlockPlainTextAdapterExtension,
];
