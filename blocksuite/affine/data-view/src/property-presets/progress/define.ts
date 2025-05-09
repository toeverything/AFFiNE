import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';
export const progressPropertyType = propertyType('progress');

export const progressPropertyModelConfig = progressPropertyType.modelConfig({
  name: 'Progress',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.number(),
    isEmpty: () => false,
    type: () => t.number.instance(),
  },
  rawValue: {
    schema: zod.number(),
    default: () => 0,
    toString: ({ value }) => value.toString(),
    fromString: ({ value }) => {
      const num = value ? Number(value) : NaN;
      return { value: isNaN(num) ? 0 : num };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
});
