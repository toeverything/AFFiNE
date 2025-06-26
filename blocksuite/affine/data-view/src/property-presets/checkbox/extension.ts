import { PropertyExtension } from '../../core';
import { checkboxPropertyConfig } from './cell-renderer';
import { checkboxPropertyModelConfig } from './define';

export const CheckBoxPropertyExtension = PropertyExtension(
  checkboxPropertyModelConfig,
  {
    meta: checkboxPropertyConfig,
  }
);
