import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';

export const imagePropertyType = propertyType('image');

export const imagePropertyModelConfig = imagePropertyType.modelConfig({
  name: 'image',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.string().nullable(),
    isEmpty: ({ value }) => value == null,
    type: () => t.image.instance(),
  },
  rawValue: {
    schema: zod.string().nullable(),
    default: () => null,
    toString: ({ value }) => value ?? '',
    fromString: ({ value }) => {
      return {
        value: value,
      };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
  hide: true,
});
