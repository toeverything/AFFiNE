import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';
import { mapWorkspaceMemberSnapshot } from './realtime-mappers';

export class MemberSearchStore extends Store {
  constructor(private readonly nbstoreService: NbstoreService) {
    super();
  }

  async getMembersByEmailOrName(
    workspaceId: string,
    query?: string,
    skip?: number,
    take?: number,
    signal?: AbortSignal
  ) {
    return await this.nbstoreService.realtime
      .request(
        'workspace.members.get',
        { workspaceId, skip, take, query },
        { signal, timeoutMs: 10000 }
      )
      .then(data => ({
        ...data,
        members: data.members.map(mapWorkspaceMemberSnapshot),
      }));
  }

  subscribeMembers(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe('workspace.members.changed', {
      workspaceId,
    });
  }
}
