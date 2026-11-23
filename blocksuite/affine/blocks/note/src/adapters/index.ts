import type { ExtensionType } from '@blocksuite/store';

import {
  DocNoteBlockHtmlAdapterExtension,
  EdgelessNoteBlockHtmlAdapterExtension,
} from './html';
import {
  DocNoteBlockMarkdownAdapterExtension,
  EdgelessNoteBlockMarkdownAdapterExtension,
} from './markdown';
import {
  DocNoteBlockPlainTextAdapterExtension,
  EdgelessNoteBlockPlainTextAdapterExtension,
} from './plain-text';

export * from './html';
export * from './markdown';
export * from './plain-text';

export const DocNoteBlockAdapterExtensions: ExtensionType[] = [
  DocNoteBlockMarkdownAdapterExtension,
  DocNoteBlockHtmlAdapterExtension,
  DocNoteBlockPlainTextAdapterExtension,
];

export const EdgelessNoteBlockAdapterExtensions: ExtensionType[] = [
  EdgelessNoteBlockMarkdownAdapterExtension,
  EdgelessNoteBlockHtmlAdapterExtension,
  EdgelessNoteBlockPlainTextAdapterExtension,
];
