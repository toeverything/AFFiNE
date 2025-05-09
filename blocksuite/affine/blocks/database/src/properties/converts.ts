import {
  createPropertyConvert,
  getTagColor,
  type SelectTag,
} from '@blocksuite/data-view';
import { presetPropertyConverts } from '@blocksuite/data-view/property-presets';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';
import { clamp } from '@blocksuite/global/gfx';
import { nanoid, Text } from '@blocksuite/store';

import { richTextPropertyModelConfig } from './rich-text/define.js';

export const databasePropertyConverts = [
  ...presetPropertyConverts,
  createPropertyConvert(
    richTextPropertyModelConfig,
    propertyModelPresets.selectPropertyModelConfig,
    (_property, cells) => {
      const options: Record<string, SelectTag> = {};
      const getTag = (name: string) => {
        if (options[name]) return options[name];
        const tag: SelectTag = {
          id: nanoid(),
          value: name,
          color: getTagColor(),
        };
        options[name] = tag;
        return tag;
      };
      return {
        cells: cells.map(v => {
          const tags = v?.toString().split(',');
          const value = tags?.[0]?.trim();
          if (value) {
            return getTag(value).id;
          }
          return undefined;
        }),
        property: {
          options: Object.values(options),
        },
      };
    }
  ),
  createPropertyConvert(
    richTextPropertyModelConfig,
    propertyModelPresets.multiSelectPropertyModelConfig,
    (_property, cells) => {
      const options: Record<string, SelectTag> = {};
      // eslint-disable-next-line sonarjs/no-identical-functions
      const getTag = (name: string) => {
        if (options[name]) return options[name];
        const tag: SelectTag = {
          id: nanoid(),
          value: name,
          color: getTagColor(),
        };
        options[name] = tag;
        return tag;
      };
      return {
        cells: cells.map(v => {
          const result: string[] = [];
          const values = v?.toString().split(',');
          values?.forEach(value => {
            value = value.trim();
            if (value) {
              result.push(getTag(value).id);
            }
          });
          return result;
        }),
        property: {
          options: Object.values(options),
        },
      };
    }
  ),
  createPropertyConvert(
    richTextPropertyModelConfig,
    propertyModelPresets.numberPropertyModelConfig,
    (_property, cells) => {
      return {
        property: {
          decimal: 0,
          format: 'number' as const,
        },
        cells: cells.map(v => {
          const num = v ? parseFloat(v.toString()) : NaN;
          return isNaN(num) ? undefined : num;
        }),
      };
    }
  ),
  createPropertyConvert(
    richTextPropertyModelConfig,
    propertyModelPresets.progressPropertyModelConfig,
    (_property, cells) => {
      return {
        property: {},
        cells: cells.map(v => {
          const progress = v ? parseInt(v.toString()) : NaN;
          return !isNaN(progress) ? clamp(progress, 0, 100) : undefined;
        }),
      };
    }
  ),
  createPropertyConvert(
    richTextPropertyModelConfig,
    propertyModelPresets.checkboxPropertyModelConfig,
    (_property, cells) => {
      const truthyValues = new Set(['yes', 'true']);
      return {
        property: {},
        cells: cells.map(v =>
          v && truthyValues.has(v.toString().toLowerCase()) ? true : undefined
        ),
      };
    }
  ),
  createPropertyConvert(
    propertyModelPresets.checkboxPropertyModelConfig,
    richTextPropertyModelConfig,
    (_property, cells) => {
      return {
        property: {},
        cells: cells.map(v => new Text(v ? 'Yes' : 'No').yText),
      };
    }
  ),
  createPropertyConvert(
    propertyModelPresets.multiSelectPropertyModelConfig,
    richTextPropertyModelConfig,
    (property, cells) => {
      const optionMap = Object.fromEntries(
        property.options.map(v => [v.id, v])
      );
      return {
        property: {},
        cells: cells.map(
          arr =>
            new Text(arr?.map(v => optionMap[v]?.value ?? '').join(',')).yText
        ),
      };
    }
  ),
  createPropertyConvert(
    propertyModelPresets.numberPropertyModelConfig,
    richTextPropertyModelConfig,
    (_property, cells) => ({
      property: {},
      cells: cells.map(v => new Text(v?.toString()).yText),
    })
  ),
  createPropertyConvert(
    propertyModelPresets.progressPropertyModelConfig,
    richTextPropertyModelConfig,
    (_property, cells) => ({
      property: {},
      cells: cells.map(v => new Text(v?.toString()).yText),
    })
  ),
  createPropertyConvert(
    propertyModelPresets.selectPropertyModelConfig,
    richTextPropertyModelConfig,
    (property, cells) => {
      const optionMap = Object.fromEntries(
        property.options.map(v => [v.id, v])
      );
      return {
        property: {},
        cells: cells.map(v => new Text(v ? optionMap[v]?.value : '').yText),
      };
    }
  ),
];
