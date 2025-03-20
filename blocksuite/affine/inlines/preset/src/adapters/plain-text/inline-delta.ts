import { linkDeltaMarkdownAdapterMatch } from '@blocksuite/affine-inline-link';
import { referenceDeltaMarkdownAdapterMatch } from '@blocksuite/affine-inline-reference';
import {
  InlineDeltaToPlainTextAdapterExtension,
  type TextBuffer,
} from '@blocksuite/affine-shared/adapters';
import type { ExtensionType } from '@blocksuite/store';

export const latexDeltaMarkdownAdapterMatch =
  InlineDeltaToPlainTextAdapterExtension({
    name: 'inlineLatex',
    match: delta => !!delta.attributes?.latex,
    toAST: delta => {
      const node: TextBuffer = {
        content: delta.insert,
      };
      if (!delta.attributes?.latex) {
        return node;
      }
      return {
        content: delta.attributes?.latex,
      };
    },
  });

export const InlineDeltaToPlainTextAdapterExtensions: ExtensionType[] = [
  referenceDeltaMarkdownAdapterMatch,
  linkDeltaMarkdownAdapterMatch,
  latexDeltaMarkdownAdapterMatch,
];
