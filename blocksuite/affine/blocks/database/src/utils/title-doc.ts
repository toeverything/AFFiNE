import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { EditorHost } from '@blocksuite/std';
import type { DeltaOperation, Text } from '@blocksuite/store';

export const getSingleDocIdFromText = (text?: Text) => {
  const deltas = text?.deltas$.value;
  if (!deltas) return;
  let linkedDocId: string | undefined = undefined;
  for (const delta of deltas) {
    if (isLinkedDoc(delta)) {
      if (linkedDocId) {
        return;
      }
      linkedDocId = delta.attributes?.reference?.pageId as string;
    } else if (delta.insert) {
      return;
    }
  }
  return linkedDocId;
};

export const isLinkedDoc = (delta: DeltaOperation) => {
  const attributes: AffineTextAttributes | undefined = delta.attributes;
  return attributes?.reference?.type === 'LinkedPage';
};

/**
 * The text as it is displayed. A linked doc is stored as a single space with a reference,
 * so it is replaced with the title of that doc. Needs the editor host to find the doc.
 */
export const getDisplayText = (
  deltas: DeltaOperation[],
  host: EditorHost | null | undefined
): string | undefined => {
  if (!host) return;
  const collection = host.std.workspace;
  return deltas
    .map(delta => {
      if (isLinkedDoc(delta)) {
        const linkedDocId = delta.attributes?.reference?.pageId as string;
        return collection.getDoc(linkedDocId)?.meta?.title;
      }
      return delta.insert;
    })
    .join('');
};

export const isPureText = (text?: Text): boolean => {
  const deltas = text?.deltas$.value;
  if (!deltas) return true;
  return deltas.every(v => !isLinkedDoc(v));
};
