import { PropertyExtension } from '@blocksuite/affine/blocks/database';

import { createdByPropertyModelConfig } from './define';
import { createdByPropertyConfig } from './view';

export const CreatedByPropertyExtension = PropertyExtension(
  createdByPropertyModelConfig,
  {
    meta: createdByPropertyConfig,
  }
);
