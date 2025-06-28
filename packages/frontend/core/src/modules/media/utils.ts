import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { bundledLanguagesInfo } from 'shiki';

const imageExts = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'avif',
  'tiff',
  'bmp',
]);

const audioExts = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']);

const videoExts = new Set([
  'mp4',
  'webm',
  'avi',
  'mov',
  'mkv',
  'mpeg',
  'ogv',
  '3gp',
]);

const builtinTextExts = new Set(['txt', 'md', 'eml', 'log', 'json', 'csv']);

function isTextExtension(ext: string): boolean {
  if (builtinTextExts.has(ext)) {
    return true;
  }

  return bundledLanguagesInfo.some(info =>
    [info.id, info.name, ...(info.aliases ?? [])].includes(ext)
  );
}

export function getAttachmentType(model: AttachmentBlockModel) {
  const type = model.props.type;

  // Check MIME type first
  if (type.startsWith('image/')) {
    return 'image';
  }

  if (type.startsWith('audio/')) {
    return 'audio';
  }

  if (type.startsWith('video/')) {
    return 'video';
  }

  if (type.startsWith('text/') || type.startsWith('message/')) {
    return 'text';
  }

  if (type === 'application/pdf') {
    return 'pdf';
  }

  // If MIME type doesn't match, check file extension
  const ext = model.props.name.split('.').pop()?.toLowerCase() ?? '';

  if (imageExts.has(ext)) {
    return 'image';
  }

  if (audioExts.has(ext)) {
    return 'audio';
  }

  if (videoExts.has(ext)) {
    return 'video';
  }

  if (isTextExtension(ext)) {
    return 'text';
  }

  if (ext === 'pdf') {
    return 'pdf';
  }

  return 'unknown';
}

export async function downloadBlobToBuffer(model: AttachmentBlockModel) {
  const sourceId = model.props.sourceId$.peek();
  if (!sourceId) {
    throw new Error('Attachment not found');
  }

  const blob = await model.store.blobSync.get(sourceId);
  if (!blob) {
    throw new Error('Attachment not found');
  }

  return await blob.arrayBuffer();
}
