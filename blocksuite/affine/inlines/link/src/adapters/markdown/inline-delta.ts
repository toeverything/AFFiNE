import { InlineDeltaToMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';
import type { PhrasingContent } from 'mdast';

export const linkDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'link',
    match: delta => !!delta.attributes?.link,
    toAST: (delta, context) => {
      const mdast: PhrasingContent = {
        type: 'text',
        value: delta.insert,
      };
      const link = delta.attributes?.link;
      if (!link) {
        return mdast;
      }

      const { current: currentMdast } = context;
      if ('value' in currentMdast) {
        if (currentMdast.value === '') {
          return {
            type: 'text',
            value: link,
          };
        }
        if (mdast.value !== link) {
          return {
            type: 'link',
            url: link,
            children: [currentMdast],
          };
        }
      }
      return mdast;
    },
  });
