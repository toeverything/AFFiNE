import type { ExtensionType } from '@blocksuite/store';

import { EmbedSyncedDocBlockHtmlAdapterExtension } from './html.js';
import { EmbedSyncedDocMarkdownAdapterExtension } from './markdown.js';
import { EmbedSyncedDocBlockPlainTextAdapterExtension } from './plain-text.js';

export const EmbedSyncedDocBlockAdapterExtensions: ExtensionType[] = [
  EmbedSyncedDocBlockHtmlAdapterExtension,
  EmbedSyncedDocMarkdownAdapterExtension,
  EmbedSyncedDocBlockPlainTextAdapterExtension,
];
