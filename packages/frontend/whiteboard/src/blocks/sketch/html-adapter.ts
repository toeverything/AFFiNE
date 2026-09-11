import { I18n } from '@affine/i18n';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
} from '@blocksuite/affine/shared/adapters';

import { SketchBlockSchema } from './model';

export const sketchBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: SketchBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === SketchBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const title =
        typeof o.node.props.title === 'string'
          ? o.node.props.title
          : ((o.node.props.title as { toString?: () => string } | undefined)
              ?.toString?.() ?? I18n['com.affine.whiteboard.sketch.title']());
      context.walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: { dataWbSketch: 'true' },
            children: [
              {
                type: 'element',
                tagName: 'figcaption',
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

export const SketchBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  sketchBlockHtmlAdapterMatcher
);
