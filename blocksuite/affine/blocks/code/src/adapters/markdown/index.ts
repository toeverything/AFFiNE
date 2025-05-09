import type { ExtensionType } from '@blocksuite/store';

import { CodeBlockMarkdownAdapterExtension } from './markdown.js';
import { CodeMarkdownPreprocessorExtension } from './preprocessor.js';

export * from './markdown.js';
export * from './preprocessor.js';

export const CodeBlockMarkdownAdapterExtensions: ExtensionType[] = [
  CodeMarkdownPreprocessorExtension,
  CodeBlockMarkdownAdapterExtension,
];
