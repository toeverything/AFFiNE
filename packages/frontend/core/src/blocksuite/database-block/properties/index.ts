import type {
  DataViewExtensionType,
  PropertyMetaConfig,
} from '@blocksuite/affine/blocks/database';

import { CreatedByPropertyExtension } from './created-by/extension';
import { createdByPropertyConfig } from './created-by/view';
import { FilePropertyExtension } from './file/extension';
import { filePropertyConfig } from './file/view';
import { MemberPropertyExtension } from './member/extension';
import { memberPropertyConfig } from './member/view';

export const propertiesPresets: PropertyMetaConfig<string, any, any, any>[] = [
  filePropertyConfig,
  memberPropertyConfig,
  createdByPropertyConfig,
];

export const AffineDatabasePropertyExtensions: DataViewExtensionType[] = [
  MemberPropertyExtension,
  FilePropertyExtension,
  CreatedByPropertyExtension,
];
