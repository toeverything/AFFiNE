import {
  generateUserAccessTokenMutation,
  type ListUserAccessTokensQuery,
  listUserAccessTokensQuery,
  revokeUserAccessTokenMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export type AccessToken = NonNullable<
  ListUserAccessTokensQuery['currentUser']
>['revealedAccessTokens'][number];

export class AccessTokenStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async listUserAccessTokens(signal?: AbortSignal): Promise<AccessToken[]> {
    const data = await this.gqlService.gql({
      query: listUserAccessTokensQuery,
      context: { signal },
    });

    return data.currentUser?.revealedAccessTokens ?? [];
  }

  async generateUserAccessToken(
    name: string,
    expiresAt?: string,
    signal?: AbortSignal
  ) {
    const data = await this.gqlService.gql({
      query: generateUserAccessTokenMutation,
      variables: { input: { name, expiresAt } },
      context: { signal },
    });

    return data.generateUserAccessToken;
  }

  async revokeUserAccessToken(id: string, signal?: AbortSignal) {
    const data = await this.gqlService.gql({
      query: revokeUserAccessTokenMutation,
      variables: { id },
      context: { signal },
    });

    return data.revokeUserAccessToken;
  }
}
