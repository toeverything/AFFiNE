import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { getAssetName } from '@blocksuite/store';

import { processImageNodeToBlock } from './utils';

export const imageBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: ImageBlockSchema.model.flavour,
  toMatch: o => HastUtils.isElement(o.node) && o.node.tagName === 'img',
  fromMatch: o => o.node.flavour === ImageBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: async (o, context) => {
      if (!HastUtils.isElement(o.node)) {
        return;
      }
      const { assets, walkerContext, configs } = context;
      if (!assets) {
        return;
      }
      const image = o.node;
      const imageURL =
        typeof image?.properties.src === 'string' ? image.properties.src : '';
      if (!imageURL) {
        return;
      }
      await processImageNodeToBlock(imageURL, walkerContext, assets, configs);
    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const blobId = (o.node.props.sourceId ?? '') as string;
      const { assets, walkerContext, updateAssetIds } = context;
      if (!assets) {
        return;
      }

      await assets.readFromBlob(blobId);
      const blob = assets.getAssets().get(blobId);
      updateAssetIds?.(blobId);
      if (!blob) {
        return;
      }
      const blobName = getAssetName(assets.getAssets(), blobId);
      const isScaledImage = o.node.props.width && o.node.props.height;
      const widthStyle = isScaledImage
        ? {
            width: `${o.node.props.width}px`,
            height: `${o.node.props.height}px`,
          }
        : {};

      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {
              className: ['affine-image-block-container'],
            },
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'img',
            properties: {
              src: `assets/${blobName}`,
              alt: blobName,
              title: (o.node.props.caption as string | undefined) ?? null,
              ...widthStyle,
            },
            children: [],
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};

export const ImageBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  imageBlockHtmlAdapterMatcher
);
