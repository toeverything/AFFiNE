import { propertyType, t } from '@blocksuite/data-view';
import { format } from 'date-fns/format';
import zod from 'zod';

export const createdTimeColumnType = propertyType('created-time');
export const createdTimePropertyModelConfig = createdTimeColumnType.modelConfig(
  {
    name: 'Created Time',
    propertyData: {
      schema: zod.object({}),
      default: () => ({}),
    },
    jsonValue: {
      schema: zod.number().nullable(),
      isEmpty: () => false,
      type: () => t.date.instance(),
    },
    rawValue: {
      schema: zod.number().nullable(),
      default: () => null,
      toString: ({ value }) =>
        value != null ? format(value, 'yyyy-MM-dd HH:mm:ss') : '',
      fromString: () => {
        return { value: null };
      },
      toJson: ({ value }) => value,
      setValue: () => {},
    },
  }
);
