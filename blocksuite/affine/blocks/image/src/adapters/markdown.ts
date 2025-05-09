import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  FetchUtils,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { getFilenameFromContentDisposition } from '@blocksuite/affine-shared/utils';
import { sha } from '@blocksuite/global/utils';
import { getAssetName, nanoid } from '@blocksuite/store';

const isImageNode = (node: MarkdownAST) => node.type === 'image';

export const imageBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: ImageBlockSchema.model.flavour,
  toMatch: o => isImageNode(o.node),
  fromMatch: o => o.node.flavour === ImageBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: async (o, context) => {
      const { configs, walkerContext, assets } = context;
      let blobId = '';
      const imageURL = 'url' in o.node ? o.node.url : '';
      if (!assets || !imageURL) {
        return;
      }
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
        const res = await FetchUtils.fetchImage(
          imageURL,
          undefined,
          configs.get('imageProxy') as string
        );
        if (!res) {
          return;
        }
        const clonedRes = res.clone();
        const file = new File(
          [await res.blob()],
          getFilenameFromContentDisposition(
            res.headers.get('Content-Disposition') ?? ''
          ) ??
            (imageURL.split('/').at(-1) ?? 'image') +
              '.' +
              (res.headers.get('Content-Type')?.split('/').at(-1) ?? 'png'),
          {
            type: res.headers.get('Content-Type') ?? '',
          }
        );
        blobId = await sha(await clonedRes.arrayBuffer());
        assets?.getAssets().set(blobId, file);
        await assets?.writeToBlob(blobId);
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
    },
  },
  fromBlockSnapshot: {
    enter: async (o, context) => {
      const { assets, walkerContext, updateAssetIds } = context;
      const blobId = (o.node.props.sourceId ?? '') as string;
      if (!assets) {
        return;
      }
      await assets.readFromBlob(blobId);
      const blob = assets.getAssets().get(blobId);
      if (!blob) {
        return;
      }
      const blobName = getAssetName(assets.getAssets(), blobId);
      updateAssetIds?.(blobId);
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
            type: 'image',
            url: `assets/${blobName}`,
            title: (o.node.props.caption as string | undefined) ?? null,
            alt: (blob as File).name ?? null,
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};

export const ImageBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  imageBlockMarkdownAdapterMatcher
);
