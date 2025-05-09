import { propertyType, t } from '@blocksuite/affine/blocks/database';
import zod from 'zod';

export const createdByColumnType = propertyType('created-by');
export const createdByPropertyModelConfig = createdByColumnType.modelConfig({
  name: 'Created By',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  fixed: {
    defaultData: {},
    defaultOrder: 'end',
    defaultShow: false,
  },
  rawValue: {
    schema: zod.string().nullable(),
    default: () => null,
    toString: ({ value }) => value ?? '',
    fromString: () => {
      return { value: null };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
  jsonValue: {
    schema: zod.string().nullable(),
    isEmpty: () => false,
    type: () => t.string.instance(),
  },
});
