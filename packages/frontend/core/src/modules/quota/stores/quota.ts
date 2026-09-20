import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';

export class WorkspaceQuotaStore extends Store {
  constructor(private readonly nbstoreService: NbstoreService) {
    super();
  }

  async fetchWorkspaceQuotaState(workspaceId: string, signal?: AbortSignal) {
    const response = await this.nbstoreService.realtime.request(
      'workspace.quota-state.get',
      { workspaceId },
      { signal, timeoutMs: 10000 }
    );
    return response.state;
  }

  subscribeWorkspaceQuotaState(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe(
      'workspace.quota-state.changed',
      { workspaceId }
    );
  }
}
