import { InlineDeltaToMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';
import type { PhrasingContent } from 'mdast';

/**
 * Serialises a tag inline delta to markdown as plain `#tag-name` text.
 * Per contracts/inline-extensions.md §4 and FR-042.
 * Canonical lowercase name is used for export.
 */
export const tagDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'tag',
    match: delta => !!delta.attributes?.tag,
    toAST: delta => {
      const tagName = delta.attributes?.tag?.name ?? '';
      const mdast: PhrasingContent = {
        type: 'text',
        value: `#${tagName}`,
      };
      return mdast;
    },
  });
