import { clamp } from '@blocksuite/global/gfx';

import { createPropertyConvert } from '../../core';
import { PropertyExtension } from '../../core/extension';
import { progressPropertyModelConfig } from '../progress/define';
import { numberPropertyConfig } from './cell-renderer';
import { numberPropertyModelConfig } from './define';

const converts = [
  createPropertyConvert(
    numberPropertyModelConfig,
    progressPropertyModelConfig,
    (_property, cells) => ({
      property: {},
      cells: cells.map(v => clamp(v ?? 0, 0, 100)),
    })
  ),
];

export const NumberPropertyExtension = PropertyExtension(
  numberPropertyModelConfig,
  {
    meta: numberPropertyConfig,
    converts,
  }
);
