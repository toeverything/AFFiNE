import { type DataViewExtensionType } from '@blocksuite/data-view';
import {
  PropertyPresetExtensions,
  propertyPresets,
} from '@blocksuite/data-view/property-presets';

import { createdTimeColumnConfig } from './created-time/cell-renderer.js';
import { CreatedTimePropertyExtension } from './created-time/extension.js';
import { linkColumnConfig } from './link/cell-renderer.js';
import { LinkPropertyExtension } from './link/extension.js';
import { richTextColumnConfig } from './rich-text/cell-renderer.js';
import { RichTextPropertyExtension } from './rich-text/extension.js';
import { titleColumnConfig } from './title/cell-renderer.js';
import { TitlePropertyExtension } from './title/extension.js';

export * from './converts.js';
const {
  checkboxPropertyConfig,
  datePropertyConfig,
  multiSelectPropertyConfig,
  numberPropertyConfig,
  progressPropertyConfig,
  selectPropertyConfig,
} = propertyPresets;

export const databaseBlockProperties = {
  checkboxColumnConfig: checkboxPropertyConfig,
  dateColumnConfig: datePropertyConfig,
  multiSelectColumnConfig: multiSelectPropertyConfig,
  numberColumnConfig: numberPropertyConfig,
  progressColumnConfig: progressPropertyConfig,
  selectColumnConfig: selectPropertyConfig,
  imageColumnConfig: propertyPresets.imagePropertyConfig,
  linkColumnConfig,
  richTextColumnConfig,
  titleColumnConfig,
  createdTimeColumnConfig,
};

export const DatabaseBlockPropertyExtensions: DataViewExtensionType[] = [
  PropertyPresetExtensions.NumberPropertyExtension,
  PropertyPresetExtensions.ProgressPropertyExtension,
  PropertyPresetExtensions.MultiSelectPropertyExtension,
  PropertyPresetExtensions.SelectPropertyExtension,
  PropertyPresetExtensions.DatePropertyExtension,
  PropertyPresetExtensions.CheckBoxPropertyExtension,
  PropertyPresetExtensions.ImagePropertyExtension,
  RichTextPropertyExtension,
  TitlePropertyExtension,
  CreatedTimePropertyExtension,
  LinkPropertyExtension,
];
