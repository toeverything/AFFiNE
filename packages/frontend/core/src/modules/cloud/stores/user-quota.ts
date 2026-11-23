import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';

export class UserQuotaStore extends Store {
  constructor(private readonly nbstoreService: NbstoreService) {
    super();
  }

  async fetchUserQuotaState(abortSignal?: AbortSignal) {
    const response = await this.nbstoreService.realtime.request(
      'user.quota-state.get',
      {},
      { signal: abortSignal, timeoutMs: 10000 }
    );
    return response.state;
  }

  subscribeUserQuotaState() {
    return this.nbstoreService.realtime.subscribe(
      'user.quota-state.changed',
      {}
    );
  }
}
