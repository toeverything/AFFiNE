import { PropertyExtension } from '../../core';
import { textPropertyConfig } from './cell-renderer';
import { textPropertyModelConfig } from './define';

export const TextPropertyExtension = PropertyExtension(
  textPropertyModelConfig,
  {
    meta: textPropertyConfig,
  }
);
