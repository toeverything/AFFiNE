import { PropertyExtension } from '@blocksuite/data-view';

import { titleColumnConfig } from './cell-renderer';
import { titlePropertyModelConfig } from './define';

export const TitlePropertyExtension = PropertyExtension(
  titlePropertyModelConfig,
  {
    meta: titleColumnConfig,
  }
);
