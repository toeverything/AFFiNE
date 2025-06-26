import { PropertyExtension } from '@blocksuite/affine/blocks/database';

import { filePropertyModelConfig } from './define';
import { filePropertyConfig } from './view';

export const FilePropertyExtension = PropertyExtension(
  filePropertyModelConfig,
  {
    meta: filePropertyConfig,
  }
);
