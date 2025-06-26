import { PropertyExtension } from '../../core';
import { imagePropertyConfig } from './cell-renderer';
import { imagePropertyModelConfig } from './define';

export const ImagePropertyExtension = PropertyExtension(
  imagePropertyModelConfig,
  {
    meta: imagePropertyConfig,
  }
);
