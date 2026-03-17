import type {
  ModelAttachmentCapability,
  PromptAttachment,
  PromptAttachmentKind,
  PromptAttachmentSourceKind,
  PromptMessage,
} from './types';
import { inferMimeType } from './utils';

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

export type CanonicalPromptAttachment = {
  kind: PromptAttachmentKind;
  sourceKind: PromptAttachmentSourceKind;
  mediaType?: string;
  source: Record<string, unknown>;
  isRemote: boolean;
};

function parseDataUrl(url: string) {
  if (!url.startsWith('data:')) {
    return null;
  }

  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }

  const meta = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const parts = meta.split(';');
  const mediaType = parts[0] || 'text/plain;charset=US-ASCII';
  const isBase64 = parts.includes('base64');

  return {
    mediaType,
    data: isBase64
      ? payload
      : Buffer.from(decodeURIComponent(payload), 'utf8').toString('base64'),
  };
}

function attachmentTypeFromMediaType(mediaType: string): PromptAttachmentKind {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function attachmentKindFromHintOrMediaType(
  hint: PromptAttachmentKind | undefined,
  mediaType: string | undefined
): PromptAttachmentKind {
  if (hint) return hint;
  return attachmentTypeFromMediaType(mediaType || '');
}

function toBase64Data(data: string, encoding: 'base64' | 'utf8' = 'base64') {
  return encoding === 'base64'
    ? data
    : Buffer.from(data, 'utf8').toString('base64');
}

function appendAttachMetadata(
  source: Record<string, unknown>,
  attachment: Exclude<PromptAttachment, string> & Record<string, unknown>
) {
  if (attachment.fileName) {
    source.file_name = attachment.fileName;
  }
  if (attachment.providerHint) {
    source.provider_hint = attachment.providerHint;
  }
  return source;
}

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

export async function canonicalizePromptAttachment(
  attachment: PromptAttachment,
  message: Pick<PromptMessage, 'params'>
): Promise<CanonicalPromptAttachment> {
  const fallbackMimeType =
    typeof message.params?.mimetype === 'string'
      ? message.params.mimetype
      : undefined;

  if (typeof attachment === 'string') {
    const dataUrl = parseDataUrl(attachment);
    const mediaType =
      fallbackMimeType ??
      dataUrl?.mediaType ??
      (await inferMimeType(attachment));
    const kind = attachmentKindFromHintOrMediaType(undefined, mediaType);
    if (dataUrl) {
      return {
        kind,
        sourceKind: 'data',
        mediaType,
        isRemote: false,
        source: {
          media_type: mediaType || dataUrl.mediaType,
          data: dataUrl.data,
        },
      };
    }

    return {
      kind,
      sourceKind: 'url',
      mediaType,
      isRemote: /^https?:\/\//.test(attachment),
      source: { url: attachment, media_type: mediaType },
    };
  }

  if ('attachment' in attachment) {
    return await canonicalizePromptAttachment(
      {
        kind: 'url',
        url: attachment.attachment,
        mimeType: attachment.mimeType,
      },
      message
    );
  }

  if (attachment.kind === 'url') {
    const dataUrl = parseDataUrl(attachment.url);
    const mediaType =
      attachment.mimeType ??
      fallbackMimeType ??
      dataUrl?.mediaType ??
      (await inferMimeType(attachment.url));
    const kind = attachmentKindFromHintOrMediaType(
      attachment.providerHint?.kind,
      mediaType
    );
    if (dataUrl) {
      return {
        kind,
        sourceKind: 'data',
        mediaType,
        isRemote: false,
        source: appendAttachMetadata(
          { media_type: mediaType || dataUrl.mediaType, data: dataUrl.data },
          attachment
        ),
      };
    }

    return {
      kind,
      sourceKind: 'url',
      mediaType,
      isRemote: /^https?:\/\//.test(attachment.url),
      source: appendAttachMetadata(
        { url: attachment.url, media_type: mediaType },
        attachment
      ),
    };
  }

  if (attachment.kind === 'data' || attachment.kind === 'bytes') {
    return {
      kind: attachmentKindFromHintOrMediaType(
        attachment.providerHint?.kind,
        attachment.mimeType
      ),
      sourceKind: attachment.kind,
      mediaType: attachment.mimeType,
      isRemote: false,
      source: appendAttachMetadata(
        {
          media_type: attachment.mimeType,
          data: toBase64Data(
            attachment.data,
            attachment.kind === 'data' ? attachment.encoding : 'base64'
          ),
        },
        attachment
      ),
    };
  }

  return {
    kind: attachmentKindFromHintOrMediaType(
      attachment.providerHint?.kind,
      attachment.mimeType
    ),
    sourceKind: 'file_handle',
    mediaType: attachment.mimeType,
    isRemote: false,
    source: appendAttachMetadata(
      { file_handle: attachment.fileHandle, media_type: attachment.mimeType },
      attachment
    ),
  };
}
