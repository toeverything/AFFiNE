import type { ExtensionType } from '@blocksuite/store';

import { EmbedYoutubeBlockHtmlAdapterExtension } from './html.js';
import { EmbedYoutubeMarkdownAdapterExtension } from './markdown.js';
import { EmbedYoutubeBlockNotionHtmlAdapterExtension } from './notion-html.js';
import { EmbedYoutubeBlockPlainTextAdapterExtension } from './plain-text.js';

export const EmbedYoutubeBlockAdapterExtensions: ExtensionType[] = [
  EmbedYoutubeBlockHtmlAdapterExtension,
  EmbedYoutubeMarkdownAdapterExtension,
  EmbedYoutubeBlockPlainTextAdapterExtension,
  EmbedYoutubeBlockNotionHtmlAdapterExtension,
];
