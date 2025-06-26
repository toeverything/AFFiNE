import { PropertyExtension } from '@blocksuite/data-view';

import { linkColumnConfig } from './cell-renderer';
import { linkPropertyModelConfig } from './define';

export const LinkPropertyExtension = PropertyExtension(
  linkPropertyModelConfig,
  {
    meta: linkColumnConfig,
  }
);
