/**
 * @file Property Model Presets Registry
 * @description Central registry of all available property model configurations for AFFiNE databases,
 * including the newly added ID property type.
 */
import { checkboxPropertyModelConfig } from './checkbox/define.js';
import { datePropertyModelConfig } from './date/define.js';
import { idPropertyModelConfig } from './id/define.js';
import { imagePropertyModelConfig } from './image/define.js';
import { multiSelectPropertyModelConfig } from './multi-select/define.js';
import { numberPropertyModelConfig } from './number/define.js';
import { progressPropertyModelConfig } from './progress/define.js';
import { selectPropertyModelConfig } from './select/define.js';
import { textPropertyModelConfig } from './text/define.js';

/**
 * Collection of all available property model configurations
 *
 * @remarks
 * This object registers the ID property type alongside other property types,
 * making it available for use in AFFiNE databases.
 */
export const propertyModelPresets = {
  checkboxPropertyModelConfig,
  datePropertyModelConfig,
  imagePropertyModelConfig,
  multiSelectPropertyModelConfig,
  numberPropertyModelConfig,
  progressPropertyModelConfig,
  selectPropertyModelConfig,
  textPropertyModelConfig,
  idPropertyModelConfig,
};
