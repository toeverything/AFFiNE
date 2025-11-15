import { DebugLogger } from '@affine/debug';

import type {
  AttachmentFile,
  ErrorAttachmentFile,
  LocalAttachmentFile,
  PersistedAttachmentFile,
  UploadingAttachmentFile,
} from './types';

export function isPersistedAttachment(
  attachment: AttachmentFile
): attachment is PersistedAttachmentFile {
  return 'fileId' in attachment;
}

export function isErrorAttachment(
  attachment: AttachmentFile
): attachment is ErrorAttachmentFile {
  return 'errorMessage' in attachment;
}

export function isUploadingAttachment(
  attachment: AttachmentFile
): attachment is UploadingAttachmentFile {
  return 'localId' in attachment && attachment.status === 'uploading';
}

export function isLocalAttachment(
  attachment: AttachmentFile
): attachment is LocalAttachmentFile {
  return 'localId' in attachment;
}

export function getAttachmentId(attachment: AttachmentFile): string {
  if (isPersistedAttachment(attachment)) {
    return attachment.fileId;
  }
  return attachment.localId;
}

export const logger = new DebugLogger('WorkspaceEmbedding');
