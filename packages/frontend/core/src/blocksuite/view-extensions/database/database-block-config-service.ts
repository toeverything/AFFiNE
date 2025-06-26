import { DataViewExtension } from '@blocksuite/affine/blocks/database';
import type { ExtensionType } from '@blocksuite/affine/store';

import { AffineDatabaseDVExtensions } from '../../database-block';

const AffineDatabaseExtensions = AffineDatabaseDVExtensions.map(extension =>
  DataViewExtension(extension)
);

export function patchDatabaseBlockConfigService(): ExtensionType {
  return {
    setup(di) {
      AffineDatabaseExtensions.forEach(extension => extension.setup(di));
    },
  };
}
