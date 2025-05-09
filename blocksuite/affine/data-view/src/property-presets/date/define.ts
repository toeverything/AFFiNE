import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';
export const datePropertyType = propertyType('date');
export const datePropertyModelConfig = datePropertyType.modelConfig({
  name: 'Date',
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
    toString: ({ value }) => (value != null ? format(value, 'yyyy-MM-dd') : ''),
    fromString: ({ value }) => {
      const date = parse(value, 'yyyy-MM-dd', new Date());
      return { value: +date };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
});
