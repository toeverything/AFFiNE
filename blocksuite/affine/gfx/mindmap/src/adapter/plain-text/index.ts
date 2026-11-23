import { ElementToPlainTextAdapterExtension } from '@blocksuite/affine-block-surface';

import { getMindMapTreeText } from '../utils';

export const mindmapToPlainTextAdapterMatcher =
  ElementToPlainTextAdapterExtension({
    name: 'mindmap',
    match: elementModel => elementModel.type === 'mindmap',
    toAST: (elementModel, context) => {
      const mindMapContent = getMindMapTreeText(elementModel, context.elements);
      return { content: mindMapContent };
    },
  });
