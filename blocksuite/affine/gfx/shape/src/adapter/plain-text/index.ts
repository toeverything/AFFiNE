import { ElementToPlainTextAdapterExtension } from '@blocksuite/affine-block-surface';
import type { MindMapTreeNode } from '@blocksuite/affine-model';

import { getShapeText, getShapeType } from '../utils';

export const shapeToPlainTextAdapterMatcher =
  ElementToPlainTextAdapterExtension({
    name: 'shape',
    match: elementModel => elementModel.type === 'shape',
    toAST: (elementModel, context) => {
      let content = '';
      const { walkerContext } = context;
      const mindMapNodeMaps = walkerContext.getGlobalContext(
        'surface:mindMap:nodeMapArray'
      ) as Array<Map<string, MindMapTreeNode>>;
      if (mindMapNodeMaps && mindMapNodeMaps.length > 0) {
        // Check if the elementModel is a mindMap node
        // If it is, we should return { content: '' } directly
        // And get the content when we handle the whole mindMap
        const isMindMapNode = mindMapNodeMaps.some(nodeMap =>
          nodeMap.has(elementModel.id as string)
        );
        if (isMindMapNode) {
          return { content };
        }
      }

      // If it is not, we should return the text and shapeType
      const text = getShapeText(elementModel);
      const type = getShapeType(elementModel);
      const shapeType = type.charAt(0).toUpperCase() + type.slice(1);
      content = `${shapeType}, with text label "${text}"`;
      return { content };
    },
  });
