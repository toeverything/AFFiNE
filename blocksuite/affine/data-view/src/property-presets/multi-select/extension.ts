import { createPropertyConvert, PropertyExtension } from '../../core';
import { selectPropertyModelConfig } from '../select/define';
import { multiSelectPropertyConfig } from './cell-renderer';
import { multiSelectPropertyModelConfig } from './define';

const converts = [
  createPropertyConvert(
    multiSelectPropertyModelConfig,
    selectPropertyModelConfig,
    (property, cells) => ({
      property,
      cells: cells.map(v => v?.[0]),
    })
  ),
];

export const MultiSelectPropertyExtension = PropertyExtension(
  multiSelectPropertyModelConfig,
  {
    meta: multiSelectPropertyConfig,
    converts,
  }
);
