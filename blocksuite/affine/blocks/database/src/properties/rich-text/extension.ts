import { PropertyExtension } from '@blocksuite/data-view';

import { richTextColumnConfig } from './cell-renderer';
import { richTextPropertyConverts as converts } from './converts';
import { richTextPropertyModelConfig } from './define';

export const RichTextPropertyExtension = PropertyExtension(
  richTextPropertyModelConfig,
  {
    meta: richTextColumnConfig,
    converts,
  }
);
