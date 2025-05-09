import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  FetchUtils,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { getFilenameFromContentDisposition } from '@blocksuite/affine-shared/utils';
import { sha } from '@blocksuite/global/utils';
import {
  type AssetsManager,
  type ASTWalkerContext,
  type BlockSnapshot,
  nanoid,
} from '@blocksuite/store';

async function processImageNode(
  imageURL: string,
  walkerContext: ASTWalkerContext<BlockSnapshot>,
  assets: AssetsManager,
  configs: Map<string, string>
) {
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
  }
  walkerContext
    .openNode(
      {
        type: 'block',
        id: nanoid(),
        flavour: ImageBlockSchema.model.flavour,
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
              await processImageNode(imageURL, walkerContext, assets, configs);
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
              await processImageNode(imageURL, walkerContext, assets, configs);
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
