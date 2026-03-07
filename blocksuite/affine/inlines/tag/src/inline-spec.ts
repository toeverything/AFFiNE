import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { InlineSpecExtension } from '@blocksuite/std/inline';
import { html } from 'lit';
import { z } from 'zod';

/**
 * Tag inline spec for Obsidian-style #tag-name tokens.
 *
 * Validation rules (per contracts/inline-extensions.md §4):
 * - Characters: [a-zA-Z0-9_\-/]+
 * - Must contain at least one non-digit character
 * - No spaces; forward slash for nested tags (#parent/child)
 * - Canonical form: lowercased, stored in tag.name
 *
 * Heading disambiguation:
 * - # at column 0 followed by SPACE = heading (not a tag)
 * - # at column 0 followed by non-space = tag candidate
 * - # after any non-whitespace or mid-line whitespace = tag candidate
 */
export const TAG_NAME_REGEX = /^[a-zA-Z0-9_\-/]+$/;

/** Returns true if the tag name is valid per the spec rules. */
export function isValidTagName(name: string): boolean {
  return TAG_NAME_REGEX.test(name) && /[a-zA-Z_\-/]/.test(name);
}

export const TagInlineSpecExtension = InlineSpecExtension<AffineTextAttributes>(
  'tag',
  () => {
    return {
      name: 'tag',
      schema: z.object({
        tag: z
          .object({
            name: z.string(), // canonical lowercase tag name without #
          })
          .optional()
          .nullable()
          .catch(undefined),
      }),
      match: delta => {
        return !!delta.attributes?.tag;
      },
      renderer: ({ delta }) => {
        const tagName = delta.attributes?.tag?.name ?? '';
        // Display with original casing from insert text; use canonical name for search.
        const displayText = String(delta.insert);
        return html`<affine-tag-inline
          .tagName=${tagName}
          .displayText=${displayText}
        ></affine-tag-inline>`;
      },
      embed: true,
    };
  }
);
