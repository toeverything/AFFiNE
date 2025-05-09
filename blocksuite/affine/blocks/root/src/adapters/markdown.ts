import { RootBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';
import type { DeltaInsert } from '@blocksuite/store';

export const rootBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: RootBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === RootBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const title = (o.node.props.title ?? { delta: [] }) as {
        delta: DeltaInsert[];
      };
      const { walkerContext, deltaConverter } = context;
      if (title.delta.length === 0) return;
      walkerContext
        .openNode(
          {
            type: 'heading',
            depth: 1,
            children: deltaConverter.deltaToAST(title.delta, 0),
          },
          'children'
        )
        .closeNode();
    },
  },
};

export const RootBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  rootBlockMarkdownAdapterMatcher
);
