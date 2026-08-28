import type { PromptAttachment, PromptMessage } from './types';

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
