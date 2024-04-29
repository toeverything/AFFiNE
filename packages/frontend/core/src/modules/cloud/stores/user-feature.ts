import { getUserFeaturesQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export class UserFeatureStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async getUserFeatures(signal: AbortSignal) {
    const data = await this.gqlService.gql({
      query: getUserFeaturesQuery,
      context: {
        signal,
      },
    });
    return {
      userId: data.currentUser?.id,
      features: data.currentUser?.features,
    };
  }
}
