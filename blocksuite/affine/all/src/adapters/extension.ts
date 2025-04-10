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
import { defaultMarkdownPreprocessors } from './markdown/preprocessor';
import { defaultBlockNotionHtmlAdapterMatchers } from './notion-html/block-matcher';
import { defaultBlockPlainTextAdapterMatchers } from './plain-text/block-matcher';

export function getAdapterFactoryExtensions(): ExtensionType[] {
  return [
    AttachmentAdapterFactoryExtension,
    ImageAdapterFactoryExtension,
    MarkdownAdapterFactoryExtension,
    PlainTextAdapterFactoryExtension,
    HtmlAdapterFactoryExtension,
    NotionTextAdapterFactoryExtension,
    NotionHtmlAdapterFactoryExtension,
    MixTextAdapterFactoryExtension,
  ];
}

export function getHtmlAdapterExtensions(): ExtensionType[] {
  return [
    ...HtmlInlineToDeltaAdapterExtensions,
    ...defaultBlockHtmlAdapterMatchers,
    ...InlineDeltaToHtmlAdapterExtensions,
  ];
}

export function getMarkdownAdapterExtensions(): ExtensionType[] {
  return [
    ...MarkdownInlineToDeltaAdapterExtensions,
    ...defaultBlockMarkdownAdapterMatchers,
    ...InlineDeltaToMarkdownAdapterExtensions,
    ...defaultMarkdownPreprocessors,
  ];
}

export function getNotionHtmlAdapterExtensions(): ExtensionType[] {
  return [
    ...NotionHtmlInlineToDeltaAdapterExtensions,
    ...defaultBlockNotionHtmlAdapterMatchers,
  ];
}

export function getPlainTextAdapterExtensions(): ExtensionType[] {
  return [
    ...defaultBlockPlainTextAdapterMatchers,
    ...InlineDeltaToPlainTextAdapterExtensions,
  ];
}
