import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';
import { NumberPropertySchema } from './types.js';
export const numberPropertyType = propertyType('number');

export const numberPropertyModelConfig = numberPropertyType.modelConfig({
  name: 'Number',
  propertyData: {
    schema: NumberPropertySchema,
    default: () => ({ decimal: 0, format: 'number' }) as const,
  },
  jsonValue: {
    schema: zod.number().nullable(),
    isEmpty: ({ value }) => value == null,
    type: () => t.number.instance(),
  },
  rawValue: {
    schema: zod.number().nullable(),
    default: () => null,
    toString: ({ value }) => value?.toString() ?? '',
    fromString: ({ value }) => {
      const num = value ? Number(value) : NaN;
      return { value: isNaN(num) ? null : num };
    },
    toJson: ({ value }) => value ?? null,
    fromJson: ({ value }) => (typeof value !== 'number' ? null : value),
  },
});
