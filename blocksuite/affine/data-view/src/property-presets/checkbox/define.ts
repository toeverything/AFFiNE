import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';
export const checkboxPropertyType = propertyType('checkbox');

const FALSE_VALUES = new Set([
  'false',
  'no',
  '0',
  '',
  'undefined',
  'null',
  '否',
  '不',
  '错',
  '错误',
  '取消',
  '关闭',
]);

export const checkboxPropertyModelConfig = checkboxPropertyType.modelConfig({
  name: 'Checkbox',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.boolean(),
    isEmpty: () => false,
    type: () => t.boolean.instance(),
  },
  rawValue: {
    schema: zod.boolean(),
    default: () => false,
    fromString: ({ value }) => ({
      value: !FALSE_VALUES.has((value?.trim() ?? '').toLowerCase()),
    }),
    toString: ({ value }) => (value ? 'True' : 'False'),
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
  minWidth: 34,
});
