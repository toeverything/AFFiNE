import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';

import { AffineDatabaseGroupByExtensions } from './group-by';
import { AffineDatabasePropertyExtensions } from './properties';

export const AffineDatabaseDVExtensions = [
  ...AffineDatabasePropertyExtensions,
  ...AffineDatabaseGroupByExtensions,
];

export function createAffineDatabaseDataSource(model: DatabaseBlockModel) {
  return new DatabaseBlockDataSource({
    model,
    extensions: AffineDatabaseDVExtensions,
  });
}
