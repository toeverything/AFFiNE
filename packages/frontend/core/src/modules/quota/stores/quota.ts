import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import { workspaceQuotaQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';

export class WorkspaceQuotaStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly nbstoreService: NbstoreService
  ) {
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

  async fetchWorkspaceQuota(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: workspaceQuotaQuery,
      variables: {
        id: workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.quota;
  }
}
