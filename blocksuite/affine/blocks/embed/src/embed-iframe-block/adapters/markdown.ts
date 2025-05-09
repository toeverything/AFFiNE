import { EmbedIframeBlockSchema } from '@blocksuite/affine-model';
import { BlockMarkdownAdapterExtension } from '@blocksuite/affine-shared/adapters';

import { createEmbedBlockMarkdownAdapterMatcher } from '../../common/adapters/markdown.js';

export const embedIframeBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher(EmbedIframeBlockSchema.model.flavour, {
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
              type: 'paragraph',
              children: [],
            },
            'children'
          )
          .openNode(
            {
              type: 'link',
              url: o.node.props.url,
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

export const EmbedIframeBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(embedIframeBlockMarkdownAdapterMatcher);
