import { ElementToMarkdownAdapterExtension } from '@blocksuite/affine-block-surface';
import { getShapeText } from '@blocksuite/affine-gfx-shape';
import {
  buildMindMapTree,
  type MindMapTreeNode,
} from '@blocksuite/affine-model';

export const mindmapToMarkdownAdapterMatcher =
  ElementToMarkdownAdapterExtension({
    name: 'mindmap',
    match: elementModel => elementModel.type === 'mindmap',
    toAST: (elementModel, context) => {
      if (elementModel.type !== 'mindmap') {
        return null;
      }

      const mindMapTree = buildMindMapTree(elementModel);
      if (!mindMapTree) {
        return null;
      }

      const { walkerContext, elements } = context;
      const traverseMindMapTree = (node: MindMapTreeNode) => {
        const shapeElement = elements[node.id as string];
        const shapeText = getShapeText(shapeElement);
        walkerContext
          .openNode(
            {
              type: 'listItem',
              spread: false,
              children: [],
            },
            'children'
          )
          .openNode(
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: shapeText,
                },
              ],
            },
            'children'
          )
          .closeNode();
        node.children.forEach(child => {
          traverseMindMapTree(child);
          walkerContext.closeNode();
        });
      };

      // First create a list node for the mind map tree
      walkerContext.openNode(
        {
          type: 'list',
          ordered: false,
          spread: false,
          children: [],
        },
        'children'
      );
      traverseMindMapTree(mindMapTree);
      walkerContext.closeNode().closeNode();

      return null;
    },
  });
