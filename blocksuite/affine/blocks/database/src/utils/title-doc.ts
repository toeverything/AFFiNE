import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
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

export const isPureText = (text?: Text): boolean => {
  const deltas = text?.deltas$.value;
  if (!deltas) return true;
  return deltas.every(v => !isLinkedDoc(v));
};
