import { footnoteReferenceDeltaToMarkdownAdapterMatcher } from '@blocksuite/affine-inline-footnote';
import { latexDeltaToMarkdownAdapterMatcher } from '@blocksuite/affine-inline-latex';
import { linkDeltaToMarkdownAdapterMatcher } from '@blocksuite/affine-inline-link';
import { referenceDeltaToMarkdownAdapterMatcher } from '@blocksuite/affine-inline-reference';
import { InlineDeltaToMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';

export const boldDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'bold',
    match: delta => !!delta.attributes?.bold,
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'strong',
        children: [currentMdast],
      };
    },
  });

export const italicDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'italic',
    match: delta => !!delta.attributes?.italic,
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'emphasis',
        children: [currentMdast],
      };
    },
  });

export const strikeDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'strike',
    match: delta => !!delta.attributes?.strike,
    toAST: (_, context) => {
      const { current: currentMdast } = context;
      return {
        type: 'delete',
        children: [currentMdast],
      };
    },
  });

export const inlineCodeDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'inlineCode',
    match: delta => !!delta.attributes?.code,
    toAST: delta => ({
      type: 'inlineCode',
      value: delta.insert,
    }),
  });

export const InlineDeltaToMarkdownAdapterExtensions = [
  referenceDeltaToMarkdownAdapterMatcher,
  linkDeltaToMarkdownAdapterMatcher,
  inlineCodeDeltaToMarkdownAdapterMatcher,
  boldDeltaToMarkdownAdapterMatcher,
  italicDeltaToMarkdownAdapterMatcher,
  strikeDeltaToMarkdownAdapterMatcher,
  latexDeltaToMarkdownAdapterMatcher,
  footnoteReferenceDeltaToMarkdownAdapterMatcher,
];
