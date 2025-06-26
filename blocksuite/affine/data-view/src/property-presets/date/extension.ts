import { PropertyExtension } from '../../core';
import { datePropertyConfig } from './cell-renderer';
import { datePropertyModelConfig } from './define';

export const DatePropertyExtension = PropertyExtension(
  datePropertyModelConfig,
  {
    meta: datePropertyConfig,
  }
);
