import type { GraphQLService } from '@affine/core/modules/cloud/services/graphql';
import { quotaQuery } from '@affine/graphql';
import { Service } from '@toeverything/infra';

export class UserQuotaStoreService extends Service {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchUserQuota(abortSignal?: AbortSignal) {
    const data = await this.graphqlService.gql({
      query: quotaQuery,
      context: {
        signal: abortSignal,
      },
    });

    if (!data.currentUser) {
      throw new Error('No logged in');
    }

    return {
      userId: data.currentUser.id,
      aiQuota: data.currentUser.copilot.quota,
      quota: data.currentUser.quota,
      used: data.collectAllBlobSizes.size,
    };
  }
}
