import { PropertyExtension } from '@blocksuite/affine/blocks/database';

import { memberPropertyModelConfig } from './define';
import { memberPropertyConfig } from './view';

export const MemberPropertyExtension = PropertyExtension(
  memberPropertyModelConfig,
  {
    meta: memberPropertyConfig,
  }
);
