import {
  HtmlInlineToDeltaAdapterExtensions,
  InlineDeltaToHtmlAdapterExtensions,
  InlineDeltaToMarkdownAdapterExtensions,
  InlineDeltaToPlainTextAdapterExtensions,
  MarkdownInlineToDeltaAdapterExtensions,
  NotionHtmlInlineToDeltaAdapterExtensions,
} from '@blocksuite/affine-inline-preset';
import {
  AttachmentAdapterFactoryExtension,
  HtmlAdapterFactoryExtension,
  ImageAdapterFactoryExtension,
  MarkdownAdapterFactoryExtension,
  MixTextAdapterFactoryExtension,
  NotionHtmlAdapterFactoryExtension,
  NotionTextAdapterFactoryExtension,
  PlainTextAdapterFactoryExtension,
} from '@blocksuite/affine-shared/adapters';
import type { ExtensionType } from '@blocksuite/store';

import { defaultBlockHtmlAdapterMatchers } from './html/block-matcher';
import { defaultBlockMarkdownAdapterMatchers } from './markdown/block-matcher';
import { defaultBlockNotionHtmlAdapterMatchers } from './notion-html/block-matcher';
import { defaultBlockPlainTextAdapterMatchers } from './plain-text/block-matcher';

export const AdapterFactoryExtensions: ExtensionType[] = [
  AttachmentAdapterFactoryExtension,
  ImageAdapterFactoryExtension,
  MarkdownAdapterFactoryExtension,
  PlainTextAdapterFactoryExtension,
  HtmlAdapterFactoryExtension,
  NotionTextAdapterFactoryExtension,
  NotionHtmlAdapterFactoryExtension,
  MixTextAdapterFactoryExtension,
];

export const HtmlAdapterExtension: ExtensionType[] = [
  ...HtmlInlineToDeltaAdapterExtensions,
  ...defaultBlockHtmlAdapterMatchers,
  ...InlineDeltaToHtmlAdapterExtensions,
];

export const MarkdownAdapterExtension: ExtensionType[] = [
  ...MarkdownInlineToDeltaAdapterExtensions,
  ...defaultBlockMarkdownAdapterMatchers,
  ...InlineDeltaToMarkdownAdapterExtensions,
];

export const NotionHtmlAdapterExtension: ExtensionType[] = [
  ...NotionHtmlInlineToDeltaAdapterExtensions,
  ...defaultBlockNotionHtmlAdapterMatchers,
];

export const PlainTextAdapterExtension: ExtensionType[] = [
  ...defaultBlockPlainTextAdapterMatchers,
  ...InlineDeltaToPlainTextAdapterExtensions,
];
