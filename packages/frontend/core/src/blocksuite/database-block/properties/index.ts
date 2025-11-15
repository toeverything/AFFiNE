import type { PropertyMetaConfig } from '@blocksuite/affine/blocks/database';

import { createdByPropertyConfig } from './created-by/view';
import { filePropertyConfig } from './file/view';
import { memberPropertyConfig } from './member/view';

export const propertiesPresets: PropertyMetaConfig<string, any, any, any>[] = [
  filePropertyConfig,
  memberPropertyConfig,
  createdByPropertyConfig,
];
