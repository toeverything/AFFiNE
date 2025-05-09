import { DividerBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

export const dividerBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: DividerBlockSchema.model.flavour,
    toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'hr',
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext } = context;
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: DividerBlockSchema.model.flavour,
              props: {},
              children: [],
            },
            'children'
          )
          .closeNode();
      },
    },
    fromBlockSnapshot: {},
  };

export const DividerBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(dividerBlockNotionHtmlAdapterMatcher);
