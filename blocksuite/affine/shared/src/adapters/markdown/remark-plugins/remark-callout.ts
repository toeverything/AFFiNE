import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * The regex for the callout
 * The emoji is optional, so we use `[\p{Extended_Pictographic}]?` to match it
 * The `u` flag is for Unicode support
 * And only match the line start
 * @example
 * ```md
 * [!💡]
 * ```
 */
const calloutRegex = /^\[!([\p{Extended_Pictographic}]?)\]/u;

export const remarkCallout: Plugin<[], Root> = () => {
  return tree => {
    visit(tree, 'blockquote', node => {
      // Only process the first child of the blockquote
      const firstChild = node.children[0];
      let children = node.children;
      if (firstChild?.type === 'paragraph') {
        const firstNode = firstChild.children[0];
        if (firstNode?.type === 'text') {
          const text = firstNode.value;
          const match = text.match(calloutRegex);
          if (match) {
            const calloutEmoji = match[1];
            // Set the callout data
            node.data = {
              isCallout: true,
              calloutEmoji,
            };

            // Remove the matched callout pattern
            const currentText = text
              .replace(calloutRegex, '')
              .replace(/^\n/, '');

            // If only one child node and it's empty text, remove all children
            if (firstChild.children.length === 1 && currentText.length === 0) {
              firstChild.children = [];
              // If the first child only has one text node, and the text is only whitespace, remove the first child of blockquote
              children = children.slice(1);
            } else {
              // Otherwise keep remaining children with the callout pattern removed
              firstChild.children[0] = {
                type: 'text',
                value: currentText.trim(),
              };
            }
          }
        }
      }

      node.children = [...children];
    });
  };
};

/**
 * Extend the BlockquoteData interface to include isCallout and calloutEmoji properties
 */
declare module 'mdast' {
  interface BlockquoteData {
    isCallout?: boolean;
    calloutEmoji?: string;
  }
}
