import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * Regex for legacy emoji-only callout: `[!💡]`
 */
const legacyCalloutRegex = /^\[!([\p{Extended_Pictographic}]?)\]/u;

/**
 * Regex for Obsidian-style typed callout:
 *   `[!TYPE]`   — not foldable
 *   `[!TYPE]-`  — foldable, collapsed by default
 *   `[!TYPE]+`  — foldable, expanded by default
 *
 * TYPE is one or more word characters (letters, digits, hyphen).
 * Title text may follow on the same line after optional whitespace.
 *
 * Group 1: type string (e.g. "WARNING")
 * Group 2: fold suffix ('-' | '+' | undefined)
 * Group 3: optional inline title after the bracket
 *
 * @example
 * ```md
 * [!WARNING]- This is a collapsible callout
 * ```
 */
const obsidianCalloutRegex = /^\[!([\p{L}\p{N}_-]+)\]([+-])?\s*(.*)?$/u;

export const remarkCallout: Plugin<[], Root> = () => {
  return tree => {
    visit(tree, 'blockquote', node => {
      const firstChild = node.children[0];
      let children = node.children;

      if (firstChild?.type === 'paragraph') {
        const firstNode = firstChild.children[0];
        if (firstNode?.type === 'text') {
          const text = firstNode.value;

          // Try Obsidian-style typed callout first.
          const obsidianMatch = text.match(obsidianCalloutRegex);
          if (obsidianMatch) {
            const rawType = obsidianMatch[1]; // e.g. "WARNING"
            const foldSuffix = obsidianMatch[2]; // '-' | '+' | undefined
            const inlineTitle = (obsidianMatch[3] ?? '').trim();

            node.data = {
              ...node.data,
              isCallout: true,
              // Store the raw type for block adapter resolution.
              calloutType: rawType,
              foldable: foldSuffix != null,
              // '-' means collapsed by default; '+' means explicitly expanded.
              folded: foldSuffix === '-',
              // Preserve any inline title text following the bracket.
              calloutTitle: inlineTitle || undefined,
            };

            // Strip the `[!TYPE]±` line from the first paragraph.
            // If the first paragraph only had this line, drop it entirely.
            const remaining = firstChild.children.slice(1);
            if (remaining.length === 0 && !inlineTitle) {
              children = children.slice(1);
            } else {
              // Replace the first text node with the inline title (may be empty).
              if (inlineTitle) {
                firstChild.children[0] = { type: 'text', value: inlineTitle };
              } else {
                firstChild.children = remaining;
              }
            }

            node.children = [...children];
            return;
          }

          // Fall back to legacy emoji-only callout.
          const legacyMatch = text.match(legacyCalloutRegex);
          if (legacyMatch) {
            const calloutEmoji = legacyMatch[1];
            node.data = {
              ...node.data,
              isCallout: true,
              calloutEmoji,
            };

            const currentText = text
              .replace(legacyCalloutRegex, '')
              .replace(/^\n/, '');

            if (firstChild.children.length === 1 && currentText.length === 0) {
              firstChild.children = [];
              children = children.slice(1);
            } else {
              firstChild.children[0] = {
                type: 'text',
                value: currentText.trim(),
              };
            }

            node.children = [...children];
          }
        }
      }
    });
  };
};

/**
 * Extend the BlockquoteData interface to include callout metadata.
 */
declare module 'mdast' {
  interface BlockquoteData {
    isCallout?: boolean;
    /** Legacy emoji-only callout icon. */
    calloutEmoji?: string;
    /** Obsidian-style type string (raw, before normalisation). */
    calloutType?: string;
    /** Whether the callout has a fold/expand toggle. */
    foldable?: boolean;
    /** Whether the callout starts collapsed. */
    folded?: boolean;
    /** Optional inline title following the `[!TYPE]` marker. */
    calloutTitle?: string;
  }
}
