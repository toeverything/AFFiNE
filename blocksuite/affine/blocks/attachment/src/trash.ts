import { getBlockProps } from '@blocksuite/affine-shared/utils';
import { nanoid } from '@blocksuite/store';

import type { AttachmentBlockComponent } from './attachment-block';

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
): string {
  return JSON.stringify(metadata);
}

export function parseAttachmentTrashMetadata(
  value: unknown
): AttachmentTrashMetadata | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value) as AttachmentTrashMetadata;
    if (parsed && typeof parsed.docId === 'string' && parsed.entry) {
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse attachment trash metadata', error);
  }
  return null;
}

export function dispatchAttachmentTrashEvent(block: AttachmentBlockComponent) {
  const { model, host } = block;
  if (!host) {
    return;
  }

  const props = sanitizeProps(getBlockProps(model));
  const store = model.store;

  // Try to get cached parent info first, fallback to live lookup
  const cachedInfo = (block as any)._cachedParentInfo;
  let parentId: string | null;
  let prevId: string | null;
  let nextId: string | null;

  if (cachedInfo) {
    parentId = cachedInfo.parentId;
    prevId = cachedInfo.prevId;
    nextId = cachedInfo.nextId;
  } else {
    // Fallback to live lookup (might be null at deletion time)
    const parent = store.getParent(model);
    const prev = store.getPrev(model);
    const next = store.getNext(model);
    parentId = parent?.id ?? null;
    prevId = prev?.id ?? null;
    nextId = next?.id ?? null;
  }

  const detail: AttachmentTrashEventDetail = {
    docId: store.id,
    entry: {
      id: nanoid(),
      blockId: model.id,
      props,
      parentId,
      prevId,
      nextId,
      deletedAt: Date.now(),
    },
  };

  host.dispatchEvent(
    new CustomEvent<AttachmentTrashEventDetail>(ATTACHMENT_TRASH_EVENT, {
      detail,
      bubbles: true,
      composed: true,
    })
  );
}

function sanitizeProps(props: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(props));
}
