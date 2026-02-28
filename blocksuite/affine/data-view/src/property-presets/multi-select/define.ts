import { nanoid } from '@blocksuite/store';
import zod from 'zod';

import { getTagColor } from '../../core/component/tags/colors.js';
import { type SelectTag, t } from '../../core/index.js';
import { propertyType } from '../../core/property/property-config.js';
import { SelectPropertySchema } from '../select/define.js';
export const multiSelectPropertyType = propertyType('multi-select');

export const multiSelectPropertyModelConfig =
  multiSelectPropertyType.modelConfig({
    name: 'Multi-select',
    propertyData: {
      schema: SelectPropertySchema,
      default: () => ({
        options: [],
      }),
    },
    jsonValue: {
      schema: zod.array(zod.string()),
      isEmpty: ({ value }) => value.length === 0,
      type: ({ data }) => t.array.instance(t.tag.instance(data.options)),
    },
    rawValue: {
      schema: zod.array(zod.string()),
      default: () => [],
      toString: ({ value, data }) =>
        value.map(id => data.options.find(v => v.id === id)?.value).join(','),
      fromString: ({ value: oldValue, data }) => {
        const optionMap = Object.fromEntries(
          data.options.map(v => [v.value, v])
        );
        const optionNames = oldValue
          .split(',')
          .map(v => v.trim())
          .filter(v => v);

        const value: string[] = [];
        optionNames.forEach(name => {
          if (!optionMap[name]) {
            const newOption: SelectTag = {
              id: nanoid(),
              value: name,
              color: getTagColor(),
            };
            data.options.push(newOption);
            value.push(newOption.id);
          } else {
            value.push(optionMap[name].id);
          }
        });

        return {
          value,
          data: data,
        };
      },
      toJson: ({ value }) => value ?? null,
      fromJson: ({ value }) =>
        Array.isArray(value) && value.every(v => typeof v === 'string')
          ? value
          : undefined,
    },
    addGroup: ({ text, oldData }) => {
      return {
        options: [
          ...(oldData.options ?? []),
          {
            id: nanoid(),
            value: text,
            color: getTagColor(),
          },
        ],
      };
    },
  });
