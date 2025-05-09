import type { ExtensionType } from '@blocksuite/store';

import { EmbedFigmaBlockHtmlAdapterExtension } from './html.js';
import { EmbedFigmaMarkdownAdapterExtension } from './markdown.js';
import { EmbedFigmaBlockNotionHtmlAdapterExtension } from './notion-html.js';
import { EmbedFigmaBlockPlainTextAdapterExtension } from './plain-text.js';

export const EmbedFigmaBlockAdapterExtensions: ExtensionType[] = [
  EmbedFigmaBlockHtmlAdapterExtension,
  EmbedFigmaMarkdownAdapterExtension,
  EmbedFigmaBlockPlainTextAdapterExtension,
  EmbedFigmaBlockNotionHtmlAdapterExtension,
];
