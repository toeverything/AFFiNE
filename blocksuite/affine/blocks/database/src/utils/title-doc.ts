import { DocDisplayMetaProvider } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { DataSource } from '@blocksuite/data-view';
import { type DeltaOperation, Text } from '@blocksuite/store';

import { EditorHostKey } from '../context/host-context.js';

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

export const getTextWithResolvedReferences = (
  value: Text | Text['yText'] | undefined,
  dataSource?: DataSource
): string => {
  if (!value) return '';
  const host = dataSource?.serviceGet(EditorHostKey);
  if (!host) return value.toString();
  const displayMeta = host.std.get(DocDisplayMetaProvider);
  const deltas: DeltaOperation[] =
    value instanceof Text ? value.deltas$.value : value.toDelta();
  return deltas
    .map(delta => {
      const reference: AffineTextAttributes['reference'] =
        delta.attributes?.reference;
      return reference?.type === 'LinkedPage'
        ? displayMeta.title(reference.pageId, {
            params: reference.params,
            title: reference.title,
            referenced: true,
          }).value
        : delta.insert;
    })
    .join('');
};
