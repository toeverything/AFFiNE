import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
  FetchUtils,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { getFilenameFromContentDisposition } from '@blocksuite/affine-shared/utils';
import { sha } from '@blocksuite/global/utils';
import { getAssetName, nanoid } from '@blocksuite/store';

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
      if (imageURL) {
        let blobId = '';
        if (!FetchUtils.fetchable(imageURL)) {
          const imageURLSplit = imageURL.split('/');
          while (imageURLSplit.length > 0) {
            const key = assets
              .getPathBlobIdMap()
              .get(decodeURIComponent(imageURLSplit.join('/')));
            if (key) {
              blobId = key;
              break;
            }
            imageURLSplit.shift();
          }
        } else {
          try {
            const res = await FetchUtils.fetchImage(
              imageURL,
              undefined,
              configs.get('imageProxy') as string
            );
            if (!res) {
              return;
            }
            const clonedRes = res.clone();
            const name =
              getFilenameFromContentDisposition(
                res.headers.get('Content-Disposition') ?? ''
              ) ??
              (imageURL.split('/').at(-1) ?? 'image') +
                '.' +
                (res.headers.get('Content-Type')?.split('/').at(-1) ?? 'png');
            const file = new File([await res.blob()], name, {
              type: res.headers.get('Content-Type') ?? '',
            });
            blobId = await sha(await clonedRes.arrayBuffer());
            assets?.getAssets().set(blobId, file);
            await assets?.writeToBlob(blobId);
          } catch {
            return;
          }
        }
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: 'affine:image',
              props: {
                sourceId: blobId,
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      }
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
