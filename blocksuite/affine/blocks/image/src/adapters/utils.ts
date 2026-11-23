import { ImageBlockSchema } from '@blocksuite/affine-model';
import {
  FetchUtils,
  FULL_FILE_PATH_KEY,
  getImageFullPath,
} from '@blocksuite/affine-shared/adapters';
import { getFilenameFromContentDisposition } from '@blocksuite/affine-shared/utils';
import { sha } from '@blocksuite/global/utils';
import {
  type AssetsManager,
  type ASTWalkerContext,
  type BlockSnapshot,
  nanoid,
} from '@blocksuite/store';

export async function processImageNodeToBlock(
  imageURL: string,
  walkerContext: ASTWalkerContext<BlockSnapshot>,
  assets: AssetsManager,
  configs: Map<string, string>
) {
  let blobId = '';
  if (!FetchUtils.fetchable(imageURL)) {
    const fullFilePath = configs.get(FULL_FILE_PATH_KEY);
    // When importing markdown file with assets in a zip file,
    // the image URL is the relative path of the image file in the zip file
    // If the full file path is provided, use it to get the image full path
    if (fullFilePath) {
      const decodedImageURL = decodeURIComponent(imageURL);
      const imageFullPath = getImageFullPath(fullFilePath, decodedImageURL);
      blobId = assets.getPathBlobIdMap().get(imageFullPath) ?? '';
    } else {
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
    } catch (err) {
      console.error('Failed to process image:', err);
      return;
    }
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
