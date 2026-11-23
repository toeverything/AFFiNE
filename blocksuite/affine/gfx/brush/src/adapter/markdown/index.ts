import { ElementToMarkdownAdapterExtension } from '@blocksuite/affine-block-surface';

export const brushToMarkdownAdapterMatcher = ElementToMarkdownAdapterExtension({
  name: 'brush',
  match: elementModel => elementModel.type === 'brush',
  toAST: () => {
    const content = `Brush Stroke`;
    return {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: content,
        },
      ],
    };
  },
});
