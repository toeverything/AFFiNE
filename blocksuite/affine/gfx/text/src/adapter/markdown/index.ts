import { ElementToMarkdownAdapterExtension } from '@blocksuite/affine-block-surface';

import { getTextElementText } from '../text';

export const textToMarkdownAdapterMatcher = ElementToMarkdownAdapterExtension({
  name: 'text',
  match: elementModel => elementModel.type === 'text',
  toAST: elementModel => {
    const content = getTextElementText(elementModel);
    if (!content) {
      return null;
    }

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
