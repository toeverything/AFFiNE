import { clamp } from '@blocksuite/global/gfx';

import { createPropertyConvert } from '../core/index.js';
import { multiSelectPropertyModelConfig } from './multi-select/define.js';
import { numberPropertyModelConfig } from './number/define.js';
import { progressPropertyModelConfig } from './progress/define.js';
import { selectPropertyModelConfig } from './select/define.js';

export const presetPropertyConverts = [
  createPropertyConvert(
    multiSelectPropertyModelConfig,
    selectPropertyModelConfig,
    (property, cells) => ({
      property,
      cells: cells.map(v => v?.[0]),
    })
  ),
  createPropertyConvert(
    numberPropertyModelConfig,
    progressPropertyModelConfig,
    (_property, cells) => ({
      property: {},
      cells: cells.map(v => clamp(v ?? 0, 0, 100)),
    })
  ),
  createPropertyConvert(
    progressPropertyModelConfig,
    numberPropertyModelConfig,
    (_property, cells) => ({
      property: {
        decimal: 0,
        format: 'number' as const,
      },
      cells: cells.map(v => v),
    })
  ),
  createPropertyConvert(
    selectPropertyModelConfig,
    multiSelectPropertyModelConfig,
    (property, cells) => ({
      property,
      cells: cells.map(v => (v ? [v] : undefined)),
    })
  ),
];
