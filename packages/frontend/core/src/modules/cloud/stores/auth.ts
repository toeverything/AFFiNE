import {
  deleteAccountMutation,
  removeAvatarMutation,
  updateUserProfileMutation,
  uploadAvatarMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GlobalState } from '../../storage';
import type { AuthSessionInfo } from '../entities/session';
import type { AuthProvider } from '../provider/auth';
import type { FetchService } from '../services/fetch';
import type { GraphQLService } from '../services/graphql';
import type { ServerService } from '../services/server';

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
    private readonly globalState: GlobalState,
    private readonly serverService: ServerService,
    private readonly authProvider: AuthProvider
  ) {
    super();
  }

  watchCachedAuthSession() {
    return this.globalState.watch<AuthSessionInfo>(
      `${this.serverService.server.id}-auth`
    );
  }

  getCachedAuthSession() {
    return this.globalState.get<AuthSessionInfo>(
      `${this.serverService.server.id}-auth`
    );
  }

  setCachedAuthSession(session: AuthSessionInfo | null) {
    this.globalState.set(`${this.serverService.server.id}-auth`, session);
  }

  getClientNonce() {
    return this.globalState.get<string>('auth-client-nonce');
  }

  setClientNonce(nonce: string) {
    this.globalState.set('auth-client-nonce', nonce);
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

  async signInMagicLink(email: string, token: string) {
    await this.authProvider.signInMagicLink(
      email,
      token,
      this.getClientNonce()
    );
  }

  async signInOauth(code: string, state: string, provider: string) {
    return await this.authProvider.signInOauth(
      code,
      state,
      provider,
      this.getClientNonce()
    );
  }

  async signInPassword(credential: {
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }) {
    await this.authProvider.signInPassword(credential);
  }

  async signOut() {
    await this.authProvider.signOut();
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
    const res = await this.fetchService.fetch('/api/auth/preflight', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: {
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to check user by email: ${email}`);
    }

    const data = (await res.json()) as {
      registered: boolean;
      hasPassword: boolean;
      magicLink: boolean;
    };

    return data;
  }

  async deleteAccount() {
    const res = await this.gqlService.gql({
      query: deleteAccountMutation,
    });
    return res.deleteAccount;
  }
}
