import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { OneMB } from '../../../../base';
import type {
  PromptAttachment,
  PromptAttachmentSourceKind,
} from '../../providers/types';
import { promptAttachmentMimeType } from '../../providers/utils';
import { AttachmentMaterializer } from './attachment-materializer';

type AttachmentProviderHint = NonNullable<
  Extract<PromptAttachment, { kind: 'data' }>['providerHint']
>;

export type AdmittedAttachmentSource = {
  id: string;
  kind: 'bytes';
  mimeType: string;
  size: number;
  fileName?: string;
  hash: string;
  providerHint?: AttachmentProviderHint;
  data: string;
  encoding: 'base64';
};

export type AttachmentAdmissionContext = {
  userId: string;
  workspaceId: string;
  sessionId?: string;
  signal?: AbortSignal;
  maxBytes?: number;
  trustedHostSuffixes?: string[];
  assertCanUseAttachment?: (source: {
    kind: PromptAttachmentSourceKind | 'alias' | 'raw_url';
    url?: string;
  }) => Promise<void> | void;
};

type ParsedPromptAttachment = {
  kind: PromptAttachmentSourceKind | 'alias' | 'raw_url';
  url?: string;
  data?: string;
  encoding?: 'base64' | 'utf8';
  mimeType?: string;
  fileName?: string;
  providerHint?: AttachmentProviderHint;
  fileHandle?: string;
};

const DEFAULT_MAX_BYTES = 64 * OneMB;

function normalizeMimeType(mediaType?: string) {
  return mediaType?.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

function toBase64Buffer(data: string, encoding: 'base64' | 'utf8' = 'base64') {
  return encoding === 'utf8'
    ? Buffer.from(data, 'utf8')
    : Buffer.from(data, 'base64');
}

function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) return;

  const mimeType = normalizeMimeType(match[1]);
  const isBase64 = !!match[2];
  const rawData = match[3] ?? '';
  const data = isBase64
    ? rawData
    : Buffer.from(decodeURIComponent(rawData), 'utf8').toString('base64');

  return { mimeType, data };
}

function hashBuffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function stableAttachmentId(hash: string) {
  return `att_${hash.slice(0, 24)}`;
}

function parsePromptAttachment(
  attachment: PromptAttachment
): ParsedPromptAttachment {
  if (typeof attachment === 'string') {
    return { kind: 'raw_url', url: attachment };
  }

  if ('attachment' in attachment) {
    return {
      kind: 'alias',
      url: attachment.attachment,
      mimeType: attachment.mimeType,
    };
  }

  switch (attachment.kind) {
    case 'url':
      return {
        kind: 'url',
        url: attachment.url,
        data: attachment.data,
        encoding: attachment.encoding,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        providerHint: attachment.providerHint,
      };
    case 'data':
    case 'bytes':
      return {
        kind: attachment.kind,
        data: attachment.data,
        encoding: attachment.encoding,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        providerHint: attachment.providerHint,
      };
    case 'file_handle':
      return {
        kind: 'file_handle',
        fileHandle: attachment.fileHandle,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        providerHint: attachment.providerHint,
      };
  }
}

function admittedBytesSource(input: {
  data: string;
  encoding?: 'base64' | 'utf8';
  mimeType: string;
  fileName?: string;
  providerHint?: AttachmentProviderHint;
}): AdmittedAttachmentSource {
  const buffer = toBase64Buffer(input.data, input.encoding);
  const hash = hashBuffer(buffer);

  return {
    id: stableAttachmentId(hash),
    kind: 'bytes',
    mimeType: normalizeMimeType(input.mimeType),
    size: buffer.byteLength,
    fileName: input.fileName,
    hash,
    providerHint: input.providerHint,
    data: buffer.toString('base64'),
    encoding: 'base64',
  };
}

@Injectable()
export class AttachmentAdmissionHost {
  constructor(private readonly materializer: AttachmentMaterializer) {}

  async admitPromptAttachment(
    attachment: PromptAttachment,
    context: AttachmentAdmissionContext
  ): Promise<AdmittedAttachmentSource> {
    const parsed = parsePromptAttachment(attachment);
    await context.assertCanUseAttachment?.({
      kind: parsed.kind,
      url: parsed.url,
    });

    if (parsed.kind === 'file_handle') {
      throw new Error('File handle attachments must be passed directly');
    }

    if (parsed.kind === 'data' || parsed.kind === 'bytes') {
      const data = parsed.data;
      const mimeType = parsed.mimeType;
      if (!data || !mimeType) {
        throw new Error('Attachment data and MIME type are required');
      }
      return admittedBytesSource({
        data,
        encoding: parsed.encoding,
        mimeType,
        fileName: parsed.fileName,
        providerHint: parsed.providerHint,
      });
    }

    if (!parsed.url) {
      throw new Error('Attachment URL is required for admission');
    }

    const dataUrl = parseDataUrl(parsed.url);
    if (dataUrl) {
      return admittedBytesSource({
        data: dataUrl.data,
        mimeType: parsed.mimeType
          ? normalizeMimeType(parsed.mimeType)
          : dataUrl.mimeType,
        fileName: parsed.fileName,
        providerHint: parsed.providerHint,
      });
    }

    const downloaded = await this.materializer.fetchRemoteAttachment(
      parsed.url,
      {
        signal: context.signal,
        maxBytes: context.maxBytes ?? DEFAULT_MAX_BYTES,
        trustedHostSuffixes: context.trustedHostSuffixes,
      }
    );
    const declaredMimeType = promptAttachmentMimeType(
      attachment,
      parsed.mimeType
    );

    return admittedBytesSource({
      data: downloaded.data,
      mimeType: declaredMimeType
        ? normalizeMimeType(declaredMimeType)
        : downloaded.mimeType,
      fileName: parsed.fileName,
      providerHint: parsed.providerHint,
    });
  }

  async admitPromptAttachments(
    attachments: PromptAttachment[],
    context: AttachmentAdmissionContext
  ) {
    return Promise.all(
      attachments.map(attachment =>
        this.admitPromptAttachment(attachment, context)
      )
    );
  }
}

export function admittedAttachmentToPromptAttachment(
  source: AdmittedAttachmentSource
): PromptAttachment {
  return {
    kind: 'bytes',
    data: source.data,
    encoding: 'base64',
    mimeType: source.mimeType,
    fileName: source.fileName,
    providerHint: source.providerHint,
  };
}
