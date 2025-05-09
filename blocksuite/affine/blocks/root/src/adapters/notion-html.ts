import { RootBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';

export const rootBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: RootBlockSchema.model.flavour,
    toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'header',
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext } = context;
        if (o.node.tagName === 'header') {
          walkerContext.skipAllChildren();
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const RootBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(rootBlockNotionHtmlAdapterMatcher);
