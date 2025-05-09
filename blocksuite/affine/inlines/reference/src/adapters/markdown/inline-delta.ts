import {
  AdapterTextUtils,
  InlineDeltaToMarkdownAdapterExtension,
} from '@blocksuite/affine-shared/adapters';
import type { PhrasingContent } from 'mdast';

export const referenceDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'reference',
    match: delta => !!delta.attributes?.reference,
    toAST: (delta, context) => {
      let mdast: PhrasingContent = {
        type: 'text',
        value: delta.insert,
      };
      const reference = delta.attributes?.reference;
      if (!reference) {
        return mdast;
      }

      const { configs } = context;
      const title = configs.get(`title:${reference.pageId}`);
      const params = reference.params ?? {};
      const url = AdapterTextUtils.generateDocUrl(
        configs.get('docLinkBaseUrl') ?? '',
        String(reference.pageId),
        params
      );
      mdast = {
        type: 'link',
        url,
        children: [
          {
            type: 'text',
            value: title ?? '',
          },
        ],
      };

      return mdast;
    },
  });
