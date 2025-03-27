import { InlineAdapterExtensions } from './adapters/extensions';
import { DefaultInlineManagerExtension } from './default-inline-manager';
import { InlineSpecExtensions } from './inline-spec';
import { MarkdownExtensions } from './markdown';

export const inlinePresetExtensions = [
  DefaultInlineManagerExtension,
  ...MarkdownExtensions,
  ...InlineSpecExtensions,
  ...InlineAdapterExtensions,
];
