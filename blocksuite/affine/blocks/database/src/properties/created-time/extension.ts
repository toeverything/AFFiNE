import { PropertyExtension } from '@blocksuite/data-view';

import { createdTimeColumnConfig } from './cell-renderer';
import { createdTimePropertyModelConfig } from './define';

export const CreatedTimePropertyExtension = PropertyExtension(
  createdTimePropertyModelConfig,
  {
    meta: createdTimeColumnConfig,
  }
);
