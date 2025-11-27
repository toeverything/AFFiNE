import { clamp } from '@blocksuite/global/gfx';

import { createPropertyConvert } from '../core/index.js';
import { idPropertyModelConfig } from './id/define.js';
import { multiSelectPropertyModelConfig } from './multi-select/define.js';
import { numberPropertyModelConfig } from './number/define.js';
import { progressPropertyModelConfig } from './progress/define.js';
import { selectPropertyModelConfig } from './select/define.js';
import { textPropertyModelConfig } from './text/define.js';
import {
  numberToIdConverter,
  textToIdConverter,
} from './types-to-id-converter.js';

// Define the interface for type conversion functions
export interface ConvertFunctionParams<P = any, C = any> {
  property: P;
  cells: C[];
}

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
  // Add converters for ID property type
  createPropertyConvert(
    textPropertyModelConfig,
    idPropertyModelConfig,
    textToIdConverter
  ),
  createPropertyConvert(
    numberPropertyModelConfig,
    idPropertyModelConfig,
    numberToIdConverter
  ),
];
