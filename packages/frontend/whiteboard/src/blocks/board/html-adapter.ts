import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
} from '@blocksuite/affine/shared/adapters';

import { BoardBlockSchema } from './model';

export const boardBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: BoardBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === BoardBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const title =
        typeof o.node.props.title === 'string'
          ? o.node.props.title
          : ((o.node.props.title as { toString?: () => string } | undefined)
              ?.toString?.() ?? 'Board');

      context.walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'section',
            properties: { dataWbBoard: 'true' },
            children: [
              {
                type: 'element',
                tagName: 'h2',
                properties: {},
                children: [{ type: 'text', value: title }],
              },
            ],
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const BoardBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  boardBlockHtmlAdapterMatcher
);
