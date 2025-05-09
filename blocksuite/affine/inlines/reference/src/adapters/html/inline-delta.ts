import type { InlineHtmlAST } from '@blocksuite/affine-shared/adapters';
import {
  AdapterTextUtils,
  InlineDeltaToHtmlAdapterExtension,
} from '@blocksuite/affine-shared/adapters';

export const referenceDeltaToHtmlAdapterMatcher =
  InlineDeltaToHtmlAdapterExtension({
    name: 'reference',
    match: delta => !!delta.attributes?.reference,
    toAST: (delta, context) => {
      let hast: InlineHtmlAST = {
        type: 'text',
        value: delta.insert,
      };
      const reference = delta.attributes?.reference;
      if (!reference) {
        return hast;
      }

      const { configs } = context;
      const title = configs.get(`title:${reference.pageId}`);
      const url = AdapterTextUtils.generateDocUrl(
        configs.get('docLinkBaseUrl') ?? '',
        String(reference.pageId),
        reference.params ?? Object.create(null)
      );
      if (title) {
        hast.value = title;
      }
      hast = {
        type: 'element',
        tagName: 'a',
        properties: {
          href: url,
        },
        children: [hast],
      };

      return hast;
    },
  });
