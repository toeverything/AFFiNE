import {
  getUserQuery,
  removeAvatarMutation,
  updateUserProfileMutation,
  uploadAvatarMutation,
} from '@affine/graphql';
import type { GlobalState } from '@toeverything/infra';
import { Store } from '@toeverything/infra';

import type { AuthSessionInfo } from '../entities/session';
import type { FetchService } from '../services/fetch';
import type { GraphQLService } from '../services/graphql';

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  avatarUrl: string | null;
  emailVerified: string | null;
}

export class AuthStore extends Store {
  constructor(
    private readonly fetchService: FetchService,
    private readonly gqlService: GraphQLService,
    private readonly globalState: GlobalState
  ) {
    super();
  }

  watchCachedAuthSession() {
    return this.globalState.watch<AuthSessionInfo>('affine-cloud-auth');
  }

  setCachedAuthSession(session: AuthSessionInfo | null) {
    this.globalState.set('affine-cloud-auth', session);
  }

  async fetchSession() {
    const url = `/api/auth/session`;
    const options: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const res = await this.fetchService.fetch(url, options);
    const data = (await res.json()) as {
      user?: AccountProfile | null;
    };
    if (!res.ok)
      throw new Error('Get session fetch error: ' + JSON.stringify(data));
    return data; // Return null if data empty
  }

  async uploadAvatar(file: File) {
    await this.gqlService.gql({
      query: uploadAvatarMutation,
      variables: {
        avatar: file,
      },
    });
  }

  async removeAvatar() {
    await this.gqlService.gql({
      query: removeAvatarMutation,
    });
  }

  async updateLabel(label: string) {
    await this.gqlService.gql({
      query: updateUserProfileMutation,
      variables: {
        input: {
          name: label,
        },
      },
    });
  }

  async checkUserByEmail(email: string) {
    const data = await this.gqlService.gql({
      query: getUserQuery,
      variables: {
        email,
      },
    });
    return {
      isExist: !!data.user,
      hasPassword: !!data.user?.hasPassword,
    };
  }
}
