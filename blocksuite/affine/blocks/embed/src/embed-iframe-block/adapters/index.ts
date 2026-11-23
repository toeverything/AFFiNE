import type { ExtensionType } from '@blocksuite/store';

import { EmbedIframeBlockHtmlAdapterExtension } from './html';
import { EmbedIframeBlockMarkdownAdapterExtension } from './markdown';
import { EmbedIframeBlockPlainTextAdapterExtension } from './plain-text';

export * from './html';
export * from './markdown';
export * from './plain-text';

export const EmbedIframeBlockAdapterExtensions: ExtensionType[] = [
  EmbedIframeBlockHtmlAdapterExtension,
  EmbedIframeBlockMarkdownAdapterExtension,
  EmbedIframeBlockPlainTextAdapterExtension,
];
