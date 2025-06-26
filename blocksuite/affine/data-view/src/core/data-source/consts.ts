import { createIdentifier } from '@blocksuite/global/di';

import type { DataSource } from './source';

export const DataSourceKey = createIdentifier<DataSource>('DataSource');
