import { LatexBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

export const latexBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: LatexBlockSchema.model.flavour,
    toMatch: o => {
      return (
        HastUtils.isElement(o.node) &&
        o.node.tagName === 'figure' &&
        !!HastUtils.querySelector(o.node, '.equation-container')
      );
    },
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { walkerContext } = context;
        const latex = HastUtils.getTextContent(
          HastUtils.querySelector(o.node, 'annotation')
        );
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: LatexBlockSchema.model.flavour,
              props: {
                latex,
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      },
    },
    fromBlockSnapshot: {},
  };

export const LatexBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(latexBlockNotionHtmlAdapterMatcher);
