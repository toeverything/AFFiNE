import type { ExtensionType } from '@blocksuite/store';

import { HtmlInlineToDeltaAdapterExtensions } from './html/html-inline';
import { InlineDeltaToHtmlAdapterExtensions } from './html/inline-delta';
import { InlineDeltaToMarkdownAdapterExtensions } from './markdown/inline-delta';
import { MarkdownInlineToDeltaAdapterExtensions } from './markdown/markdown-inline';
import { NotionHtmlInlineToDeltaAdapterExtensions } from './notion-html/html-inline';

export const InlineAdapterExtensions: ExtensionType[] = [
  HtmlInlineToDeltaAdapterExtensions,
  InlineDeltaToHtmlAdapterExtensions,
  NotionHtmlInlineToDeltaAdapterExtensions,
  InlineDeltaToMarkdownAdapterExtensions,
  MarkdownInlineToDeltaAdapterExtensions,
].flat();

export * from './html/html-inline';
export * from './html/inline-delta';
export * from './markdown/inline-delta';
export * from './markdown/markdown-inline';
export * from './notion-html/html-inline';
