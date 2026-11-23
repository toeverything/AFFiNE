import { ElementToMarkdownAdapterExtension } from '@blocksuite/affine-block-surface';

import { getConnectorText } from '../text';

export const connectorToMarkdownAdapterMatcher =
  ElementToMarkdownAdapterExtension({
    name: 'connector',
    match: elementModel => elementModel.type === 'connector',
    toAST: elementModel => {
      const text = getConnectorText(elementModel);
      if (!text) {
        return null;
      }

      const content = `Connector, with text label "${text}"`;
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
