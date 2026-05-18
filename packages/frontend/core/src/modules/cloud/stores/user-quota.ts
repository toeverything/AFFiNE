import { getCurrentUserProfileQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';
import type { GraphQLService } from '../services/graphql';

export class UserQuotaStore extends Store {
  constructor(
    private readonly graphqlService: GraphQLService,
    private readonly nbstoreService: NbstoreService
  ) {
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

  async fetchUserQuota(abortSignal?: AbortSignal) {
    const data = await this.graphqlService.gql({
      query: getCurrentUserProfileQuery,
      context: {
        signal: abortSignal,
      },
    });

    if (!data.currentUser) {
      throw new Error('No logged in');
    }

    return {
      userId: data.currentUser.id,
      quota: data.currentUser.quota,
      used: data.currentUser.quotaUsage.storageQuota,
    };
  }
}
