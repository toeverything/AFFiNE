import { InlineAdapterExtensions } from './adapters/extensions';
import { DefaultInlineManagerExtension } from './default-inline-manager';
import { InlineSpecExtensions } from './inline-spec';
import { MarkdownExtensions } from './markdown';
import { LatexEditorInlineManagerExtension } from './nodes/latex-node/latex-editor-menu';

export const inlinePresetExtensions = [
  DefaultInlineManagerExtension,
  ...MarkdownExtensions,
  LatexEditorInlineManagerExtension,
  ...InlineSpecExtensions,
  ...InlineAdapterExtensions,
];
