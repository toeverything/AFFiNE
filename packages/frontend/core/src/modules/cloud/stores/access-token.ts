import {
  generateUserAccessTokenMutation,
  revokeUserAccessTokenMutation,
} from '@affine/graphql';
import type { AccessTokenSnapshot } from '@affine/realtime';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';
import type { GraphQLService } from '../services/graphql';

export type AccessToken = AccessTokenSnapshot & { token: string };
export type ListedAccessToken = AccessTokenSnapshot;

export class AccessTokenStore extends Store {
  constructor(
    private readonly gqlService: GraphQLService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async listUserAccessTokens(
    signal?: AbortSignal
  ): Promise<ListedAccessToken[]> {
    const { tokens } = await this.nbstoreService.realtime.request(
      'user.access-tokens.get',
      {},
      { signal, timeoutMs: 10000 }
    );
    return tokens;
  }

  subscribeUserAccessTokens() {
    return this.nbstoreService.realtime.subscribe(
      'user.access-tokens.changed',
      {}
    );
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
