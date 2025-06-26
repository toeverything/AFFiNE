import type { ServiceProvider } from '@blocksuite/global/di';

import { DataSourceKey } from './consts';

export function getDataSource(provider: ServiceProvider) {
  return provider.get(DataSourceKey);
}
