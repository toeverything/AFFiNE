import { checkboxPropertyConfig } from './checkbox/cell-renderer.js';
import { CheckBoxPropertyExtension } from './checkbox/extension.js';
import { datePropertyConfig } from './date/cell-renderer.js';
import { DatePropertyExtension } from './date/extension.js';
import { imagePropertyConfig } from './image/cell-renderer.js';
import { ImagePropertyExtension } from './image/extension.js';
import { multiSelectPropertyConfig } from './multi-select/cell-renderer.js';
import { MultiSelectPropertyExtension } from './multi-select/extension.js';
import { numberPropertyConfig } from './number/cell-renderer.js';
import { NumberPropertyExtension } from './number/extension.js';
import { progressPropertyConfig } from './progress/cell-renderer.js';
import { ProgressPropertyExtension } from './progress/extension.js';
import { selectPropertyConfig } from './select/cell-renderer.js';
import { SelectPropertyExtension } from './select/extension.js';
import { textPropertyConfig } from './text/cell-renderer.js';
import { TextPropertyExtension } from './text/extension.js';

export * from './converts.js';
export * from './number/types.js';
export * from './select/define.js';

export const propertyPresets = {
  checkboxPropertyConfig,
  datePropertyConfig,
  imagePropertyConfig,
  multiSelectPropertyConfig,
  numberPropertyConfig,
  progressPropertyConfig,
  selectPropertyConfig,
  textPropertyConfig,
};

export const PropertyPresetExtensions = {
  NumberPropertyExtension,
  ProgressPropertyExtension,
  MultiSelectPropertyExtension,
  SelectPropertyExtension,
  TextPropertyExtension,
  ImagePropertyExtension,
  DatePropertyExtension,
  CheckBoxPropertyExtension,
};
