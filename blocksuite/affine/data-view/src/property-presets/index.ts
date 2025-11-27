/**
 * @file Property Presets and Configurations
 * @description This file exports all available property configurations for AFFiNE databases,
 * including cell renderers and property metadata.
 */
import { checkboxPropertyConfig } from './checkbox/cell-renderer.js';
import { datePropertyConfig } from './date/cell-renderer.js';
import { idPropertyConfig } from './id/cell-renderer.js';
import { imagePropertyConfig } from './image/cell-renderer.js';
import { multiSelectPropertyConfig } from './multi-select/cell-renderer.js';
import { numberPropertyConfig } from './number/cell-renderer.js';
import { progressPropertyConfig } from './progress/cell-renderer.js';
import { selectPropertyConfig } from './select/cell-renderer.js';
import { textPropertyConfig } from './text/cell-renderer.js';

export * from './converts.js';
export * from './id/index.js';
export * from './number/types.js';
export * from './select/define.js';

/**
 * Collection of all property configuration presets for AFFiNE databases
 *
 * @remarks
 * This registry makes all property types available throughout the application,
 * including the newly implemented ID property type that serves as a unique identifier
 * column for database tables. The ID property has special restrictions:
 * - Only one ID column allowed per table
 * - ID columns are read-only (fixed: true)
 * - Uses a Lock icon to indicate its special status
 */
export const propertyPresets = {
  checkboxPropertyConfig,
  datePropertyConfig,
  imagePropertyConfig,
  multiSelectPropertyConfig,
  numberPropertyConfig,
  progressPropertyConfig,
  selectPropertyConfig,
  textPropertyConfig,
  idPropertyConfig,
};
