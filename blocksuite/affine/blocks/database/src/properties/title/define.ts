import { propertyType, t } from '@blocksuite/data-view';
import { Text } from '@blocksuite/store';
import { Doc } from 'yjs';
import zod from 'zod';

import { EditorHostKey } from '../../context/host-context.js';
import { isLinkedDoc } from '../../utils/title-doc.js';

export const titleColumnType = propertyType('title');

export const titlePropertyModelConfig = titleColumnType.modelConfig({
  name: 'Title',
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
    schema: zod.custom<Text>(data => data instanceof Text).optional(),
    default: () => undefined,
    toString: ({ value }) => value?.toString() ?? '',
    fromString: ({ value }) => {
      return { value: new Text(value) };
    },
    toJson: ({ value, dataSource }) => {
      if (!value) return '';
      const host = dataSource.serviceGet(EditorHostKey);
      if (host) {
        const collection = host.std.workspace;
        const deltas = value.deltas$.value;
        const text = deltas
          .map(delta => {
            if (isLinkedDoc(delta)) {
              const linkedDocId = delta.attributes?.reference?.pageId as string;
              return collection.getDoc(linkedDocId)?.meta?.title;
            }
            return delta.insert;
          })
          .join('');
        return text;
      }
      return value?.toString() ?? '';
    },
    fromJson: ({ value }) => new Text(value),
    onUpdate: ({ value, callback }) => {
      value?.yText.observe(callback);
      callback();
      return {
        dispose: () => {
          value?.yText.unobserve(callback);
        },
      };
    },
    setValue: ({ value, newValue }) => {
      if (value == null) {
        return;
      }
      const v = newValue as unknown;
      if (v == null) {
        value.replace(0, value.length, '');
        return;
      }
      if (typeof v === 'string') {
        value.replace(0, value.length, v);
        return;
      }
      if (newValue instanceof Text) {
        new Doc().getMap('root').set('text', newValue.yText);
        value.clear();
        value.applyDelta(newValue.toDelta());
        return;
      }
    },
  },
  fixed: {
    defaultData: {},
    defaultShow: true,
  },
});
