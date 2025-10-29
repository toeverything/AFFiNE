export type AttachmentTrashEntry = {
  id: string;
  blockId: string;
  props: Record<string, unknown>;
  parentId: string | null;
  prevId: string | null;
  nextId: string | null;
  deletedAt: number;
};

export type AttachmentTrashEventDetail = {
  docId: string;
  entry: AttachmentTrashEntry;
};

export type AttachmentTrashMetadata = AttachmentTrashEventDetail;

export const ATTACHMENT_TRASH_EVENT = 'affine:attachment-trashed';
export const ATTACHMENT_TRASH_META_KEY = 'attachmentTrashMeta';
export const ATTACHMENT_TRASH_CUSTOM_PROPERTY =
  'custom:' + ATTACHMENT_TRASH_META_KEY;

export function serializeAttachmentTrashMetadata(
  metadata: AttachmentTrashMetadata
) {
  return JSON.stringify(metadata);
}

export function parseAttachmentTrashMetadata(
  value: unknown
): AttachmentTrashMetadata | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value) as AttachmentTrashMetadata;
    if (
      parsed &&
      typeof parsed.docId === 'string' &&
      parsed.entry &&
      typeof parsed.entry.blockId === 'string'
    ) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse attachment trash metadata', error);
  }
  return null;
}
