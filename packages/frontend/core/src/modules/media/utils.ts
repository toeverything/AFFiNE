import type { AttachmentBlockModel } from '@blocksuite/affine/model';

export function getAttachmentType(model: AttachmentBlockModel) {
  // Check MIME type first
  if (model.props.type.startsWith('image/')) {
    return 'image';
  }

  if (model.props.type.startsWith('audio/')) {
    return 'audio';
  }

  if (model.props.type.startsWith('video/')) {
    return 'video';
  }

  if (model.props.type === 'application/pdf') {
    return 'pdf';
  }

  // If MIME type doesn't match, check file extension
  const ext = model.props.name.split('.').pop()?.toLowerCase() || '';

  if (
    [
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'svg',
      'avif',
      'tiff',
      'bmp',
    ].includes(ext)
  ) {
    return 'image';
  }

  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'].includes(ext)) {
    return 'audio';
  }

  if (
    ['mp4', 'webm', 'avi', 'mov', 'mkv', 'mpeg', 'ogv', '3gp'].includes(ext)
  ) {
    return 'video';
  }

  if (ext === 'pdf') {
    return 'pdf';
  }

  return 'unknown';
}

export async function downloadBlobToBuffer(model: AttachmentBlockModel) {
  const sourceId = model.props.sourceId;
  if (!sourceId) {
    throw new Error('Attachment not found');
  }

  const blob = await model.doc.blobSync.get(sourceId);
  if (!blob) {
    throw new Error('Attachment not found');
  }

  const arrayBuffer = await blob.arrayBuffer();
  return arrayBuffer;
}
