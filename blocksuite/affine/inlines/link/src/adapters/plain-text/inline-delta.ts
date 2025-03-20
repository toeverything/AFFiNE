import {
  InlineDeltaToPlainTextAdapterExtension,
  type TextBuffer,
} from '@blocksuite/affine-shared/adapters';

export const linkDeltaMarkdownAdapterMatch =
  InlineDeltaToPlainTextAdapterExtension({
    name: 'link',
    match: delta => !!delta.attributes?.link,
    toAST: delta => {
      const linkText = delta.insert;
      const node: TextBuffer = {
        content: linkText,
      };
      const link = delta.attributes?.link;
      if (!link) {
        return node;
      }

      const content = `${linkText ? `${linkText}: ` : ''}${link}`;
      return {
        content,
      };
    },
  });
