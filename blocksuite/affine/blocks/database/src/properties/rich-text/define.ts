import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { propertyType, t } from '@blocksuite/data-view';
import type { DeltaInsert } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import * as Y from 'yjs';
import zod from 'zod';

import { EditorHostKey } from '../../context/host-context.js';
import { isLinkedDoc } from '../../utils/title-doc.js';

export const richTextColumnType = propertyType('rich-text');
export type RichTextCellType = Text | Text['yText'];
export const toYText = (text?: RichTextCellType): undefined | Text['yText'] => {
  if (text instanceof Text) {
    return text.yText;
  }
  return text;
};

export const richTextPropertyModelConfig = richTextColumnType.modelConfig({
  name: 'Text',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.string(),
    type: () => t.richText.instance(),
    isEmpty: ({ value }) => !value,
  },
  rawValue: {
    schema: zod
      .custom<RichTextCellType>(
        data => data instanceof Text || data instanceof Y.Text
      )
      .optional(),
    default: () => undefined,
    toString: ({ value }) => value?.toString() ?? '',
    fromString: ({ value }) => {
      return {
        value: new Text(value),
      };
    },
    toJson: ({ value, dataSource }) => {
      if (!value) return null;
      const host = dataSource.serviceGet(EditorHostKey);
      if (host) {
        const collection = host.std.workspace;
        const yText = toYText(value);
        const deltas = yText?.toDelta();
        const text = deltas
          .map((delta: DeltaInsert<AffineTextAttributes>) => {
            if (isLinkedDoc(delta)) {
              const linkedDocId = delta.attributes?.reference?.pageId as string;
              return collection.getDoc(linkedDocId)?.meta?.title;
            }
            return delta.insert;
          })
          .join('');
        return text;
      }
      return value?.toString() ?? null;
    },
    fromJson: ({ value }) =>
      typeof value !== 'string' ? undefined : new Text(value),
    onUpdate: ({ value, callback }) => {
      const yText = toYText(value);
      yText?.observe(callback);
      callback();
      return {
        dispose: () => {
          yText?.unobserve(callback);
        },
      };
    },
  },
});
