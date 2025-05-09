import { EmbedIframeBlockSchema } from '@blocksuite/affine-model';
import { BlockHtmlAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockHtmlAdapterMatcher } from '../../common/adapters/html';

export const embedIframeBlockHtmlAdapterMatcher =
  createEmbedBlockHtmlAdapterMatcher(EmbedIframeBlockSchema.model.flavour, {
    fromBlockSnapshot: {
      enter: (o, context) => {
        const { walkerContext } = context;
        // Parse as link
        if (
          typeof o.node.props.title !== 'string' ||
          typeof o.node.props.url !== 'string'
        ) {
          return;
        }

        walkerContext
          .openNode(
            {
              type: 'element',
              tagName: 'div',
              properties: {
                className: ['affine-paragraph-block-container'],
              },
              children: [],
            },
            'children'
          )
          .openNode(
            {
              type: 'element',
              tagName: 'a',
              properties: {
                href: o.node.props.url,
              },
              children: [
                {
                  type: 'text',
                  value: o.node.props.title,
                },
              ],
            },
            'children'
          )
          .closeNode()
          .closeNode();
      },
    },
  });

export const EmbedIframeBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  embedIframeBlockHtmlAdapterMatcher
);
