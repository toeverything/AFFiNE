import type {
  ModelAttachmentCapability,
  PromptAttachment,
  PromptMessage,
} from './types';

export const IMAGE_ATTACHMENT_CAPABILITY: ModelAttachmentCapability = {
  kinds: ['image'],
  sourceKinds: ['url', 'data'],
  allowRemoteUrls: true,
};

export const GEMINI_ATTACHMENT_CAPABILITY: ModelAttachmentCapability = {
  kinds: ['image', 'audio', 'file'],
  sourceKinds: ['url', 'data', 'bytes', 'file_handle'],
  allowRemoteUrls: true,
};

export function promptAttachmentHasSource(
  attachment: PromptAttachment
): boolean {
  if (typeof attachment === 'string') {
    return !!attachment.trim();
  }

  if ('attachment' in attachment) {
    return !!attachment.attachment;
  }

  switch (attachment.kind) {
    case 'url':
      return !!attachment.url;
    case 'data':
    case 'bytes':
      return !!attachment.data;
    case 'file_handle':
      return !!attachment.fileHandle;
  }
}

export function applyPromptAttachmentMimeTypeHintForNative(
  attachment: PromptAttachment,
  message: Pick<PromptMessage, 'params'>
): PromptAttachment {
  const fallbackMimeType =
    typeof message.params?.mimetype === 'string'
      ? message.params.mimetype
      : undefined;

  if (typeof attachment === 'string') {
    if (attachment.startsWith('data:')) return attachment;
    return fallbackMimeType
      ? { attachment, mimeType: fallbackMimeType }
      : attachment;
  }

  if ('attachment' in attachment) {
    if (attachment.mimeType || !fallbackMimeType) return attachment;
    return { ...attachment, mimeType: fallbackMimeType };
  }

  if (attachment.kind !== 'url') return attachment;

  if (
    attachment.url.startsWith('data:') ||
    attachment.mimeType ||
    !fallbackMimeType
  ) {
    return attachment;
  }

  return { ...attachment, mimeType: fallbackMimeType };
}
