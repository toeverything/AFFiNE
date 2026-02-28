import { nanoid } from '@blocksuite/store';
import zod from 'zod';

import { getTagColor } from '../../core/component/tags/colors.js';
import { type SelectTag, SelectTagSchema, t } from '../../core/index.js';
import { propertyType } from '../../core/property/property-config.js';
export const selectPropertyType = propertyType('select');
export const SelectPropertySchema = zod.object({
  options: zod.array(SelectTagSchema),
});
export type SelectPropertyData = zod.infer<typeof SelectPropertySchema>;
export const selectPropertyModelConfig = selectPropertyType.modelConfig({
  name: 'Select',
  propertyData: {
    schema: SelectPropertySchema,
    default: () => ({
      options: [],
    }),
  },
  jsonValue: {
    schema: zod.string().nullable(),
    isEmpty: ({ value }) => value == null,
    type: ({ data }) => t.tag.instance(data.options),
  },
  rawValue: {
    schema: zod.string().nullable(),
    default: () => null,
    toString: ({ value, data }) =>
      data.options.find(v => v.id === value)?.value ?? '',
    fromString: ({ value: oldValue, data }) => {
      if (!oldValue) {
        return { value: null, data: data };
      }
      const optionMap = Object.fromEntries(data.options.map(v => [v.value, v]));
      const name = oldValue
        .split(',')
        .map(v => v.trim())
        .find(v => v);
      if (!name) {
        return { value: null, data: data };
      }

      let value: string | undefined;
      const option = optionMap[name];
      if (!option) {
        const newOption: SelectTag = {
          id: nanoid(),
          value: name,
          color: getTagColor(),
        };
        data.options.push(newOption);
        value = newOption.id;
      } else {
        value = option.id;
      }

      return {
        value,
        data: data,
      };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
  addGroup: ({ text, oldData }) => {
    return {
      options: [
        ...(oldData.options ?? []),
        { id: nanoid(), value: text, color: getTagColor() },
      ],
    };
  },
});
