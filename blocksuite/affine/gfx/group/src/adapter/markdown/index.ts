import { ElementToMarkdownAdapterExtension } from '@blocksuite/affine-block-surface';

import { getGroupTitle } from '../text';

export const groupToMarkdownAdapterMatcher = ElementToMarkdownAdapterExtension({
  name: 'group',
  match: elementModel => elementModel.type === 'group',
  toAST: elementModel => {
    const title = getGroupTitle(elementModel);
    if (!title) {
      return null;
    }

    const content = `Group, with title "${title}"`;
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
