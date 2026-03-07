import type { ExtensionType } from '@blocksuite/store';

import { HtmlInlineToDeltaAdapterExtensions } from './html/html-inline';
import { InlineDeltaToHtmlAdapterExtensions } from './html/inline-delta';
import { InlineDeltaToMarkdownAdapterExtensions } from './markdown/inline-delta';
import { MarkdownInlineToDeltaAdapterExtensions } from './markdown/markdown-inline';
import { wikilinkMarkdownASTToDeltaMatcher } from './markdown/wikilink-delta-converter';
import { WikilinkMarkdownPreprocessorExtension } from './markdown/wikilink-preprocessor';
import { NotionHtmlInlineToDeltaAdapterExtensions } from './notion-html/html-inline';

export const InlineAdapterExtensions: ExtensionType[] = [
  HtmlInlineToDeltaAdapterExtensions,
  InlineDeltaToHtmlAdapterExtensions,
  NotionHtmlInlineToDeltaAdapterExtensions,
  InlineDeltaToMarkdownAdapterExtensions,
  MarkdownInlineToDeltaAdapterExtensions,
  // Wikilink paste-path: preprocessor + AST-to-delta matcher
  WikilinkMarkdownPreprocessorExtension,
  wikilinkMarkdownASTToDeltaMatcher,
].flat();

export * from './html/html-inline';
export * from './html/inline-delta';
export * from './markdown/inline-delta';
export * from './markdown/markdown-inline';
export * from './markdown/wikilink-delta-converter';
export * from './markdown/wikilink-preprocessor';
export * from './notion-html/html-inline';
