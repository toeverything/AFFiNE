import type { Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { HastUtils } from '../../utils/hast';

/**
 * The content copied from google docs will be wrapped in <b> tag
 * To handle this case, we need to convert the <b> tag to a <div> tag
 */
const inlineElements = new Set(['b']);

export const rehypeInlineToBlock: Plugin<[], Root> = () => {
  return tree => {
    visit(tree, 'element', node => {
      // Check if the current node is an inline element
      if (inlineElements.has(node.tagName)) {
        // Check if the node has a block element child
        const hasBlockChild = node.children.some(
          child =>
            child.type === 'element' && HastUtils.isTagBlock(child.tagName)
        );

        if (hasBlockChild) {
          const originalTag = node.tagName;
          // Convert the inline element to a div
          node.tagName = 'div';
          // Keep the original properties
          node.properties = {
            ...node.properties,
            'data-original-tag': originalTag,
          };
        }
      }
    });
  };
};
