import { propertyType, t } from '@blocksuite/data-view';
import { Text } from '@blocksuite/store';
import zod from 'zod';

import { getTextWithResolvedReferences } from '../../utils/title-doc.js';

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
    schema: zod.string().nullable(),
    type: () => t.richText.instance(),
    isEmpty: ({ value }) => !value,
  },
  rawValue: {
    schema: zod
      .custom<RichTextCellType>(data => Text.isTextLike(data))
      .optional(),
    default: () => undefined,
    toString: ({ value }) => value?.toString() ?? '',
    fromString: ({ value }) => {
      return {
        value: new Text(value),
      };
    },
    toJson: ({ value, dataSource }) =>
      value ? getTextWithResolvedReferences(value, dataSource) : null,
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
