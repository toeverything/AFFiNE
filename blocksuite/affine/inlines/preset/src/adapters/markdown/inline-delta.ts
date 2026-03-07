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

/**
 * Obsidian %% comment %% serialiser per FR-042 / contracts §2.
 * Single-line → %%text%%
 * Multi-line text (contains newlines) → %%\ntext\n%%
 */
export const obsidianCommentDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'obsidian-comment',
    match: delta => !!delta.attributes?.obsidianComment,
    toAST: delta => {
      const text = delta.insert;
      const isMultiLine = text.includes('\n');
      const value = isMultiLine ? `%%\n${text}\n%%` : `%%${text}%%`;
      return { type: 'text', value };
    },
  });

export const InlineDeltaToMarkdownAdapterExtensions = [
  inlineCodeDeltaToMarkdownAdapterMatcher,
  boldDeltaToMarkdownAdapterMatcher,
  italicDeltaToMarkdownAdapterMatcher,
  strikeDeltaToMarkdownAdapterMatcher,
  obsidianCommentDeltaToMarkdownAdapterMatcher,
];
