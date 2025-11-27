/**
 * @file Database Block Properties Registry
 * @description Central registry that maps all available column types for AFFiNE database blocks,
 * including the newly added ID column type.
 */
import { propertyPresets } from '@blocksuite/data-view/property-presets';

import { createdTimeColumnConfig } from './created-time/cell-renderer.js';
import { linkColumnConfig } from './link/cell-renderer.js';
import { richTextColumnConfig } from './rich-text/cell-renderer.js';
import { titleColumnConfig } from './title/cell-renderer.js';

export * from './converts.js';

/**
 * Extract property configs from presets for better readability
 */
const {
  checkboxPropertyConfig,
  datePropertyConfig,
  multiSelectPropertyConfig,
  numberPropertyConfig,
  progressPropertyConfig,
  selectPropertyConfig,
  idPropertyConfig,
} = propertyPresets;

/**
 * Registry of all available column configurations for database blocks
 *
 * @remarks
 * This object maps column type names to their respective configurations,
 * making them available for use within database blocks.
 *
 * The ID column (idColumnConfig) has special behaviors:
 * - Only one ID column allowed per table (enforced in block-utils.ts)
 * - ID columns are read-only to protect data integrity
 * - Visual indication (lock icon) shows users that IDs cannot be edited
 */
export const databaseBlockProperties = {
  checkboxColumnConfig: checkboxPropertyConfig,
  dateColumnConfig: datePropertyConfig,
  multiSelectColumnConfig: multiSelectPropertyConfig,
  numberColumnConfig: numberPropertyConfig,
  progressColumnConfig: progressPropertyConfig,
  selectColumnConfig: selectPropertyConfig,
  imageColumnConfig: propertyPresets.imagePropertyConfig,
  idColumnConfig: idPropertyConfig,
  linkColumnConfig,
  richTextColumnConfig,
  titleColumnConfig,
  createdTimeColumnConfig,
};
