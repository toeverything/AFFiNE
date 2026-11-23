import type { ExtensionType } from '@blocksuite/store';

import { ImageBlockHtmlAdapterExtension } from './html.js';
import { ImageBlockMarkdownAdapterExtension } from './markdown.js';
import { ImageBlockNotionHtmlAdapterExtension } from './notion-html.js';

export const ImageBlockAdapterExtensions: ExtensionType[] = [
  ImageBlockHtmlAdapterExtension,
  ImageBlockMarkdownAdapterExtension,
  ImageBlockNotionHtmlAdapterExtension,
];
