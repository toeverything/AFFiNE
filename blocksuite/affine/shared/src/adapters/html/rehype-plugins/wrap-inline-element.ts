import type { Element, ElementContent, Root } from 'hast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { HastUtils } from '../../utils/hast';

/**
 * In some cases, the inline elements are wrapped in a div tag mixed with block elements
 * We need to wrap them in a p tag to avoid the inline elements being treated as a block element
 */
export const rehypeWrapInlineElements: Plugin<[], Root> = () => {
  return tree => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'div') {
        // First check if we have a mix of inline and block elements
        let hasInline = false;
        let hasBlock = false;
        for (const child of node.children) {
          if (child.type === 'element') {
            if (HastUtils.isElementInline(child)) {
              hasInline = true;
            } else if (HastUtils.isTagBlock(child.tagName)) {
              hasBlock = true;
            }
            if (hasInline && hasBlock) break;
          }
        }

        // Only process if we have both inline and block elements
        if (hasInline && hasBlock) {
          const newChildren: ElementContent[] = [];
          let currentInlineGroup: ElementContent[] = [];

          for (const child of node.children) {
            if (child.type === 'element') {
              const elementChild = child;
              if (HastUtils.isElementInline(elementChild)) {
                // Add to current inline group
                currentInlineGroup.push(elementChild);
              } else if (HastUtils.isTagBlock(elementChild.tagName)) {
                // If we have accumulated inline elements, wrap them in a p tag
                if (currentInlineGroup.length > 0) {
                  newChildren.push({
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: currentInlineGroup,
                  });
                  currentInlineGroup = [];
                }
                // Add the block element as is
                newChildren.push(elementChild);
              } else {
                // For unknown elements, treat them as inline
                currentInlineGroup.push(elementChild);
              }
            } else {
              // For text nodes, treat them as inline content
              currentInlineGroup.push(child);
            }
          }

          // Handle any remaining inline elements at the end
          if (currentInlineGroup.length > 0) {
            newChildren.push({
              type: 'element',
              tagName: 'p',
              properties: {},
              children: currentInlineGroup,
            });
          }

          // Replace the original children with the new structure
          node.children = newChildren;
        }
      }
    });
  };
};
