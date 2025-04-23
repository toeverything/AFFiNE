import { autoResizeElementsCommand } from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import type {
  AttachmentBlockProps,
  ImageBlockModel,
  ImageBlockProps,
} from '@blocksuite/affine-model';
import { NativeClipboardProvider } from '@blocksuite/affine-shared/services';
import {
  downloadBlob,
  getBlockProps,
  humanFileSize,
  isInsidePageEditor,
  readImageSize,
  transformModel,
  withTempBlobData,
} from '@blocksuite/affine-shared/utils';
import { Bound, type IVec, Point, Vec } from '@blocksuite/global/gfx';
import {
  BlockSelection,
  type BlockStdScope,
  type EditorHost,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import {
  SURFACE_IMAGE_CARD_HEIGHT,
  SURFACE_IMAGE_CARD_WIDTH,
} from './components/image-block-fallback.js';
import type { ImageBlockComponent } from './image-block.js';
import type { ImageEdgelessBlockComponent } from './image-edgeless-block.js';

const MAX_RETRY_COUNT = 3;
const DEFAULT_ATTACHMENT_NAME = 'affine-attachment';

const imageUploads = new Set<string>();
export function setImageUploading(blockId: string) {
  imageUploads.add(blockId);
}
export function setImageUploaded(blockId: string) {
  imageUploads.delete(blockId);
}
export function isImageUploading(blockId: string) {
  return imageUploads.has(blockId);
}

export async function uploadBlobForImage(
  editorHost: EditorHost,
  blockId: string,
  blob: Blob
): Promise<void> {
  if (isImageUploading(blockId)) {
    console.error('The image is already uploading!');
    return;
  }
  setImageUploading(blockId);
  const doc = editorHost.doc;
  let sourceId: string | undefined;

  try {
    sourceId = await doc.blobSync.set(blob);
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      toast(
        editorHost,
        `Failed to upload image! ${error.message || error.toString()}`
      );
    }
  } finally {
    setImageUploaded(blockId);

    const imageModel = doc.getModelById(blockId) as ImageBlockModel | null;
    if (sourceId && imageModel) {
      const props: Partial<ImageBlockProps> = {
        sourceId,
        // Assign a default size to make sure the image can be displayed correctly.
        width: 100,
        height: 100,
      };

      const blob = await doc.blobSync.get(sourceId);
      if (blob) {
        try {
          const size = await readImageSize(blob);
          props.width = size.width;
          props.height = size.height;
        } catch {
          // Ignore the error
          console.warn('Failed to read image size');
        }
      }

      doc.withoutTransact(() => {
        doc.updateBlock(imageModel, props);
      });
    }
  }
}

async function getImageBlob(model: ImageBlockModel) {
  const sourceId = model.props.sourceId;
  if (!sourceId) {
    return null;
  }

  const doc = model.doc;
  const blob = await doc.blobSync.get(sourceId);

  if (!blob) {
    return null;
  }

  if (!blob.type) {
    const buffer = await blob.arrayBuffer();
    const FileType = await import('file-type');
    const fileType = await FileType.fileTypeFromBuffer(buffer);
    if (!fileType?.mime.startsWith('image/')) {
      return null;
    }

    return new Blob([buffer], { type: fileType.mime });
  }

  if (!blob.type.startsWith('image/')) {
    return null;
  }

  return blob;
}

export async function fetchImageBlob(
  block: ImageBlockComponent | ImageEdgelessBlockComponent
) {
  try {
    if (block.model.props.sourceId !== block.lastSourceId || !block.blobUrl) {
      block.loading = true;
      block.error = false;
      block.blob = undefined;

      if (block.blobUrl) {
        URL.revokeObjectURL(block.blobUrl);
        block.blobUrl = undefined;
      }
    } else if (block.blobUrl) {
      return;
    }

    const { model } = block;
    const { sourceId } = model.props;
    const { id, doc } = model;

    if (isImageUploading(id)) {
      return;
    }

    if (!sourceId) {
      return;
    }

    const blob = await doc.blobSync.get(sourceId);
    if (!blob) {
      return;
    }

    block.loading = false;
    block.blob = blob;
    block.blobUrl = URL.createObjectURL(blob);
    block.lastSourceId = sourceId;
  } catch (error) {
    block.retryCount++;
    console.warn(`${error}, retrying`, block.retryCount);

    if (block.retryCount < MAX_RETRY_COUNT) {
      setTimeout(() => {
        fetchImageBlob(block).catch(console.error);
        // 1s, 2s, 3s
      }, 1000 * block.retryCount);
    } else {
      block.loading = false;
      block.error = true;
    }
  }
}

export async function downloadImageBlob(
  block: ImageBlockComponent | ImageEdgelessBlockComponent
) {
  const { host, downloading } = block;
  if (downloading) {
    toast(host, 'Download in progress...');
    return;
  }

  block.downloading = true;

  const blob = await getImageBlob(block.model);
  if (!blob) {
    toast(host, `Unable to download image!`);
    return;
  }

  toast(host, `Downloading image...`);

  downloadBlob(blob, 'image');

  block.downloading = false;
}

export async function resetImageSize(
  block: ImageBlockComponent | ImageEdgelessBlockComponent
) {
  const { blob, model } = block;
  if (!blob) {
    return;
  }

  const file = new File([blob], 'image.png', { type: blob.type });
  const size = await readImageSize(file);
  const bound = model.elementBound;
  const props: Partial<ImageBlockProps> = {
    width: size.width,
    height: size.height,
  };

  if (!bound.w || !bound.h) {
    bound.w = size.width;
    bound.h = size.height;
    props.xywh = bound.serialize();
  }

  block.doc.updateBlock(model, props);
}

function convertToPng(blob: Blob): Promise<Blob | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.addEventListener('load', _ => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        c.toBlob(resolve, 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = reader.result as string;
    });
    reader.addEventListener('error', () => resolve(null));
    reader.readAsDataURL(blob);
  });
}

export async function copyImageBlob(
  block: ImageBlockComponent | ImageEdgelessBlockComponent
) {
  const { host, model, std } = block;
  let blob = await getImageBlob(model);
  if (!blob) {
    console.error('Failed to get image blob');
    return;
  }

  let copied = false;

  try {
    // Copies the image as PNG in Electron.
    const copyAsPNG = std.getOptional(NativeClipboardProvider)?.copyAsPNG;
    if (copyAsPNG) {
      copied = await copyAsPNG(await blob.arrayBuffer());
    }

    // The current clipboard only supports the `image/png` image format.
    // The `ClipboardItem.supports('image/svg+xml')` is not currently used,
    // because when pasting, the content is not read correctly.
    //
    // https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem
    // https://alexharri.com/blog/clipboard
    if (!copied) {
      if (blob.type !== 'image/png') {
        blob = await convertToPng(blob);
        if (!blob) {
          console.error('Failed to convert blob to PNG');
          return;
        }
      }

      if (!globalThis.isSecureContext) {
        console.error(
          'Clipboard API is not available in insecure context',
          blob.type,
          blob
        );
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    }

    toast(host, 'Copied image to clipboard');
  } catch (error) {
    console.error(error);
  }
}

function hasExceeded(
  std: BlockStdScope,
  files: File[],
  maxFileSize = std.store.blobSync.maxFileSize
) {
  const exceeded = files.some(file => file.size > maxFileSize);

  if (exceeded) {
    const size = humanFileSize(maxFileSize, true, 0);
    toast(std.host, `You can only upload files less than ${size}`);
  }

  return exceeded;
}

export function shouldResizeImage(node: Node, target: EventTarget | null) {
  return !!(
    target &&
    target instanceof HTMLElement &&
    node.contains(target) &&
    target.classList.contains('resize')
  );
}

export function addSiblingImageBlock(
  std: BlockStdScope,
  files: File[],
  targetModel: BlockModel,
  place: 'after' | 'before' = 'after'
) {
  files = files.filter(file => file.type.startsWith('image/'));
  if (!files.length) return;

  if (hasExceeded(std, files)) return;

  const imageBlockProps: Partial<ImageBlockProps> &
    {
      flavour: 'affine:image';
    }[] = files.map(file => ({
    flavour: 'affine:image',
    size: file.size,
  }));

  const blockIds = std.store.addSiblingBlocks(
    targetModel,
    imageBlockProps,
    place
  );
  blockIds.forEach(
    (blockId, index) => void uploadBlobForImage(std.host, blockId, files[index])
  );
  return blockIds;
}

export function addImageBlocks(
  std: BlockStdScope,
  files: File[],
  parent?: BlockModel | string | null,
  parentIndex?: number
) {
  files = files.filter(file => file.type.startsWith('image/'));
  if (!files.length) return;

  if (hasExceeded(std, files)) return;

  const blockIds = files.map(file =>
    std.store.addBlock('affine:image', { size: file.size }, parent, parentIndex)
  );
  blockIds.forEach(
    (blockId, index) => void uploadBlobForImage(std.host, blockId, files[index])
  );
  return blockIds;
}

/**
 * Turn the image block into a attachment block.
 */
export async function turnImageIntoCardView(
  block: ImageBlockComponent | ImageEdgelessBlockComponent
) {
  const doc = block.doc;
  if (!doc.schema.flavourSchemaMap.has('affine:attachment')) {
    console.error('The attachment flavour is not supported!');
    return;
  }

  const model = block.model;
  const sourceId = model.props.sourceId;
  const blob = await getImageBlob(model);
  if (!sourceId || !blob) {
    console.error('Image data not available');
    return;
  }

  const { saveImageData, getAttachmentData } = withTempBlobData();
  saveImageData(sourceId, {
    width: model.props.width,
    height: model.props.height,
  });
  const attachmentConvertData = getAttachmentData(sourceId);
  const attachmentProp: Partial<AttachmentBlockProps> = {
    sourceId,
    name: DEFAULT_ATTACHMENT_NAME,
    size: blob.size,
    type: blob.type,
    caption: model.props.caption,
    ...attachmentConvertData,
  };
  transformModel(model, 'affine:attachment', attachmentProp);
}

export async function addImages(
  std: BlockStdScope,
  files: File[],
  options: {
    point?: IVec;
    maxWidth?: number;
    transformPoint?: boolean; // determines whether we should use `toModelCoord` to convert the point
  }
): Promise<string[]> {
  files = [...files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return [];

  if (hasExceeded(std, files)) return [];

  const gfx = std.get(GfxControllerIdentifier);
  const { point, maxWidth, transformPoint = true } = options;
  let { x, y } = gfx.viewport.center;
  if (point) {
    if (transformPoint) {
      [x, y] = gfx.viewport.toModelCoord(...point);
    } else {
      [x, y] = point;
    }
  }

  const dropInfos: { point: Point; blockId: string }[] = [];
  const IMAGE_STACK_GAP = 32;
  const isMultipleFiles = files.length > 1;
  const inTopLeft = isMultipleFiles ? true : false;

  // create image cards without image data
  files.forEach((file, index) => {
    const point = new Point(
      x + index * IMAGE_STACK_GAP,
      y + index * IMAGE_STACK_GAP
    );
    const center = Vec.toVec(point);
    const bound = calcBoundByOrigin(center, inTopLeft);
    const blockId = std.store.addBlock(
      'affine:image',
      {
        size: file.size,
        xywh: bound.serialize(),
        index: gfx.layer.generateIndex(),
      },
      gfx.surface
    );
    dropInfos.push({ point, blockId });
  });

  // upload image data and update the image model
  const uploadPromises = files.map(async (file, index) => {
    const { point, blockId } = dropInfos[index];
    const block = std.store.getBlock(blockId);
    const imageSize = await readImageSize(file);

    if (!imageSize.width || !imageSize.height) {
      std.store.deleteBlock(block!.model);

      toast(std.host, 'Failed to read image size, please try another image');
      throw new Error('Failed to read image size');
    }

    const sourceId = await std.store.blobSync.set(file);

    const center = Vec.toVec(point);
    // If maxWidth is provided, limit the width of the image to maxWidth
    // Otherwise, use the original width
    const width = maxWidth
      ? Math.min(imageSize.width, maxWidth)
      : imageSize.width;
    const height = maxWidth
      ? (imageSize.height / imageSize.width) * width
      : imageSize.height;
    const bound = calcBoundByOrigin(center, inTopLeft, width, height);

    std.store.withoutTransact(() => {
      gfx.updateElement(blockId, {
        sourceId,
        ...imageSize,
        width,
        height,
        xywh: bound.serialize(),
      } satisfies Partial<ImageBlockProps>);
    });
  });
  await Promise.all(uploadPromises);

  const blockIds = dropInfos.map(info => info.blockId);
  gfx.selection.set({
    elements: blockIds,
    editing: false,
  });
  if (isMultipleFiles) {
    std.command.exec(autoResizeElementsCommand);
  }
  return blockIds;
}

export function calcBoundByOrigin(
  point: IVec,
  inTopLeft = false,
  width = SURFACE_IMAGE_CARD_WIDTH,
  height = SURFACE_IMAGE_CARD_HEIGHT
) {
  return inTopLeft
    ? new Bound(point[0], point[1], width, height)
    : Bound.fromCenter(point, width, height);
}

export function duplicate(block: ImageBlockComponent) {
  const model = block.model;
  const blockProps = getBlockProps(model);
  const {
    width: _width,
    height: _height,
    xywh: _xywh,
    rotate: _rotate,
    zIndex: _zIndex,
    ...duplicateProps
  } = blockProps;

  const { doc } = model;
  const parent = doc.getParent(model);
  if (!parent) {
    console.error(`Parent not found for block(${model.flavour}) ${model.id}`);
    return;
  }

  const index = parent?.children.indexOf(model);
  const duplicateId = doc.addBlock(
    model.flavour,
    duplicateProps,
    parent,
    index + 1
  );

  const editorHost = block.host;
  editorHost.updateComplete
    .then(() => {
      const { selection } = editorHost;
      selection.setGroup('note', [
        selection.create(BlockSelection, {
          blockId: duplicateId,
        }),
      ]);
      if (isInsidePageEditor(editorHost)) {
        const duplicateElement = editorHost.view.getBlock(duplicateId);
        if (duplicateElement) {
          duplicateElement.scrollIntoView(true);
        }
      }
    })
    .catch(console.error);
}
