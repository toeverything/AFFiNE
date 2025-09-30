import { LiveData, Service } from '@toeverything/infra';

import type { ExplorerIconStore, ExplorerType } from '../store/explorer-icon';

export class ExplorerIconService extends Service {
  constructor(private readonly store: ExplorerIconStore) {
    super();
  }

  getIcon(type: ExplorerType, id: string) {
    return this.store.getIcon(type, id);
  }

  setIcon(options: Parameters<ExplorerIconStore['setIcon']>[0]) {
    return this.store.setIcon(options);
  }

  icon$(type: ExplorerType, id: string) {
    return LiveData.from(this.store.watchIcon(type, id), null);
  }
}
