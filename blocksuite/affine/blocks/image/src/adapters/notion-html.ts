import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';

import { processImageNodeToBlock } from './utils';

export const imageBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: ImageBlockSchema.model.flavour,
    toMatch: o => {
      return (
        HastUtils.isElement(o.node) &&
        (o.node.tagName === 'img' ||
          (o.node.tagName === 'figure' &&
            !!HastUtils.querySelector(o.node, '.image')))
      );
    },
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: async (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { assets, walkerContext, configs } = context;
        if (!assets) {
          return;
        }
        if (walkerContext.getGlobalContext('hast:disableimg')) {
          return;
        }

        switch (o.node.tagName) {
          case 'img': {
            const image = o.node;
            const imageURL =
              typeof image?.properties.src === 'string'
                ? image.properties.src
                : '';
            if (imageURL) {
              await processImageNodeToBlock(
                imageURL,
                walkerContext,
                assets,
                configs
              );
            }
            break;
          }
          case 'figure': {
            const imageFigureWrapper = HastUtils.querySelector(
              o.node,
              '.image'
            );
            let imageURL = '';
            if (imageFigureWrapper) {
              const image = HastUtils.querySelector(imageFigureWrapper, 'img');
              imageURL =
                typeof image?.properties.src === 'string'
                  ? image.properties.src
                  : '';
            }
            if (imageURL) {
              await processImageNodeToBlock(
                imageURL,
                walkerContext,
                assets,
                configs
              );
            }
            break;
          }
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const ImageBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(imageBlockNotionHtmlAdapterMatcher);
