import { ElementToPlainTextAdapterExtension } from '@blocksuite/affine-block-surface';

import { getConnectorText } from '../text';

export const connectorToPlainTextAdapterMatcher =
  ElementToPlainTextAdapterExtension({
    name: 'connector',
    match: elementModel => elementModel.type === 'connector',
    toAST: elementModel => {
      const text = getConnectorText(elementModel);
      const content = `Connector, with text label "${text}"`;
      return { content };
    },
  });
