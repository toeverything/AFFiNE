import { createPropertyConvert, PropertyExtension } from '../../core';
import { multiSelectPropertyModelConfig } from '../multi-select/define';
import { selectPropertyModelConfig } from '../select/define';
import { selectPropertyConfig } from './cell-renderer';

const converts = [
  createPropertyConvert(
    selectPropertyModelConfig,
    multiSelectPropertyModelConfig,
    (property, cells) => ({
      property,
      cells: cells.map(v => (v ? [v] : undefined)),
    })
  ),
];

export const SelectPropertyExtension = PropertyExtension(
  selectPropertyModelConfig,
  {
    meta: selectPropertyConfig,
    converts,
  }
);
