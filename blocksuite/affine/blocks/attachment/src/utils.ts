import { toast } from '@blocksuite/affine-components/toast';
import {
  type AttachmentBlockModel,
  type AttachmentBlockProps,
  AttachmentBlockSchema,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import { humanFileSize } from '@blocksuite/affine-shared/utils';
import { Bound, type IVec, Vec } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import type { AttachmentBlockComponent } from './attachment-block.js';

const attachmentUploads = new Set<string>();
export function setAttachmentUploading(blockId: string) {
  attachmentUploads.add(blockId);
}
export function setAttachmentUploaded(blockId: string) {
  attachmentUploads.delete(blockId);
}
function isAttachmentUploading(blockId: string) {
  return attachmentUploads.has(blockId);
}

/**
 * This function will not verify the size of the file.
 */
export async function uploadAttachmentBlob(
  std: BlockStdScope,
  blockId: string,
  blob: Blob,
  filetype: string,
  isEdgeless?: boolean
): Promise<void> {
  if (isAttachmentUploading(blockId)) {
    return;
  }

  let sourceId: string | undefined;

  try {
    setAttachmentUploading(blockId);
    sourceId = await std.store.blobSync.set(blob);
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      toast(
        std.host,
        `Failed to upload attachment! ${error.message || error.toString()}`
      );
    }
  } finally {
    setAttachmentUploaded(blockId);

    const block = std.store.getBlock(blockId);

    std.store.withoutTransact(() => {
      if (!block) return;

      std.store.updateBlock(block.model, {
        sourceId,
      } satisfies Partial<AttachmentBlockProps>);
    });

    std.getOptional(TelemetryProvider)?.track('AttachmentUploadedEvent', {
      page: `${isEdgeless ? 'whiteboard' : 'doc'} editor`,
      module: 'attachment',
      segment: 'attachment',
      control: 'uploader',
      type: filetype,
      category: block && sourceId ? 'success' : 'failure',
    });
  }
}

export async function getAttachmentBlob(model: AttachmentBlockModel) {
  const sourceId = model.props.sourceId;
  if (!sourceId) {
    return null;
  }

  const doc = model.doc;
  let blob = await doc.blobSync.get(sourceId);

  if (blob) {
    blob = new Blob([blob], { type: model.props.type });
  }

  return blob;
}

export async function checkAttachmentBlob(block: AttachmentBlockComponent) {
  const model = block.model;
  const { id } = model;
  const { sourceId } = model.props;

  if (isAttachmentUploading(id)) {
    block.loading = true;
    block.error = false;
    block.allowEmbed = false;
    if (block.blobUrl) {
      URL.revokeObjectURL(block.blobUrl);
      block.blobUrl = undefined;
    }
    return;
  }

  try {
    if (!sourceId) {
      return;
    }

    const blob = await getAttachmentBlob(model);
    if (!blob) {
      return;
    }

    block.loading = false;
    block.error = false;
    block.allowEmbed = block.embedded();
    if (block.blobUrl) {
      URL.revokeObjectURL(block.blobUrl);
    }
    block.blobUrl = URL.createObjectURL(blob);
  } catch (error) {
    console.warn(error, model, sourceId);

    block.loading = false;
    block.error = true;
    block.allowEmbed = false;
    if (block.blobUrl) {
      URL.revokeObjectURL(block.blobUrl);
      block.blobUrl = undefined;
    }
  }
}

/**
 * Since the size of the attachment may be very large,
 * the download process may take a long time!
 */
export function downloadAttachmentBlob(block: AttachmentBlockComponent) {
  const { host, model, loading, error, downloading, blobUrl } = block;
  if (downloading) {
    toast(host, 'Download in progress...');
    return;
  }

  if (loading) {
    toast(host, 'Please wait, file is loading...');
    return;
  }

  const name = model.props.name;
  const shortName = name.length < 20 ? name : name.slice(0, 20) + '...';

  if (error || !blobUrl) {
    toast(host, `Failed to download ${shortName}!`);
    return;
  }

  block.downloading = true;

  toast(host, `Downloading ${shortName}`);

  const tmpLink = document.createElement('a');
  const event = new MouseEvent('click');
  tmpLink.download = name;
  tmpLink.href = blobUrl;
  tmpLink.dispatchEvent(event);
  tmpLink.remove();

  block.downloading = false;
}

export async function getFileType(file: File) {
  if (file.type) return file.type;

  // If the file type is not available, try to get it from the buffer.
  const buffer = await file.arrayBuffer();
  const FileType = await import('file-type');
  const fileType = await FileType.fileTypeFromBuffer(buffer);
  return fileType ? fileType.mime : '';
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

/**
 * Add a new attachment block before / after the specified block.
 */
export async function addSiblingAttachmentBlocks(
  std: BlockStdScope,
  files: File[],
  targetModel: BlockModel,
  place: 'before' | 'after' = 'after',
  isEmbed?: boolean
) {
  if (!files.length) return;

  if (hasExceeded(std, files)) return;

  const doc = targetModel.doc;
  const flavour = AttachmentBlockSchema.model.flavour;

  const droppedInfos = await Promise.all(
    files.map(async file => {
      const { name, size } = file;
      const type = await getFileType(file);
      const props = {
        flavour,
        name,
        size,
        type,
        embed: isEmbed,
      } satisfies Partial<AttachmentBlockProps> & {
        flavour: typeof flavour;
      };
      return { props, file };
    })
  );

  const blockIds = doc.addSiblingBlocks(
    targetModel,
    droppedInfos.map(info => info.props),
    place
  );

  const uploadPromises = blockIds.map(async (blockId, index) => {
    const { props, file } = droppedInfos[index];
    await uploadAttachmentBlob(std, blockId, file, props.type);
  });
  await Promise.all(uploadPromises);

  return blockIds;
}

export async function addAttachments(
  std: BlockStdScope,
  files: File[],
  point?: IVec,
  transformPoint?: boolean // determines whether we should use `toModelCoord` to convert the point
): Promise<string[]> {
  if (!files.length) return [];

  if (hasExceeded(std, files)) return [];

  const gfx = std.get(GfxControllerIdentifier);
  let { x, y } = gfx.viewport.center;
  if (point) {
    let transform = transformPoint ?? true;
    if (transform) {
      [x, y] = gfx.viewport.toModelCoord(...point);
    } else {
      [x, y] = point;
    }
  }

  const xy = [x, y];
  const style = 'cubeThick';
  const gap = 32;
  const width = EMBED_CARD_WIDTH.cubeThick;
  const height = EMBED_CARD_HEIGHT.cubeThick;

  const droppedInfos = files.map((file, index) => {
    const { name, size } = file;
    const center = Vec.addScalar(xy, index * gap);
    const xywh = Bound.fromCenter(center, width, height).serialize();
    const props = {
      style,
      name,
      size,
      xywh,
    } satisfies Partial<AttachmentBlockProps>;

    return { file, props };
  });

  // upload file and update the attachment model
  const uploadPromises = droppedInfos.map(async ({ props, file }) => {
    const type = await getFileType(file);

    const blockId = std.store.addBlock(
      AttachmentBlockSchema.model.flavour,
      { ...props, type },
      gfx.surface
    );

    await uploadAttachmentBlob(std, blockId, file, type, true);

    return blockId;
  });
  const blockIds = await Promise.all(uploadPromises);

  gfx.selection.set({
    elements: blockIds,
    editing: false,
  });

  return blockIds;
}
