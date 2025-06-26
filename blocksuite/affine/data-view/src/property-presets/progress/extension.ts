import { createPropertyConvert, PropertyExtension } from '../../core';
import { numberPropertyModelConfig } from '../number/define';
import { progressPropertyConfig } from './cell-renderer';
import { progressPropertyModelConfig } from './define';

const converts = [
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
];

export const ProgressPropertyExtension = PropertyExtension(
  progressPropertyModelConfig,
  {
    meta: progressPropertyConfig,
    converts,
  }
);
