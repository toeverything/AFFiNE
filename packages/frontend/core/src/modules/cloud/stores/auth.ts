import {
  deleteAccountMutation,
  removeAvatarMutation,
  ServerDeploymentType,
  updateUserProfileMutation,
  uploadAvatarMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GlobalState, NbstoreService } from '../../storage';
import type { AuthSessionInfo } from '../entities/session';
import type { AuthProvider, SignInUserInfo } from '../provider/auth';
import type { FetchService } from '../services/fetch';
import type { GraphQLService } from '../services/graphql';
import type { ServerService } from '../services/server';

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  authMethods?: {
    password: { bound: boolean };
    oauth: { bound: boolean; providers: string[] };
    passkey: { bound: boolean; count: number };
  };
  avatarUrl: string | null;
  emailVerified: string | null;
  features?: string[];
}

export class AuthStore extends Store {
  constructor(
    private readonly fetchService: FetchService,
    private readonly gqlService: GraphQLService,
    private readonly globalState: GlobalState,
    private readonly serverService: ServerService,
    private readonly authProvider: AuthProvider,
    private readonly nbstoreService: NbstoreService
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

  setCachedSignInUser(user: SignInUserInfo) {
    this.setCachedAuthSession({
      account: {
        id: user.id,
        email: user.email,
        label: user.name,
        avatar: user.avatarUrl,
        info: {
          id: user.id,
          email: user.email,
          name: user.name,
          hasPassword: Boolean(user.hasPassword),
          avatarUrl: user.avatarUrl,
          emailVerified: user.emailVerified ? 'true' : null,
        },
      },
    });
  }

  getClientNonce() {
    return this.globalState.get<string>('auth-client-nonce');
  }

  setClientNonce(nonce: string) {
    this.globalState.set('auth-client-nonce', nonce);
  }

  async fetchSession() {
    const { user } = await this.fetchService
      .fetch('/api/auth/session', { cache: 'no-store' })
      .then(res => res.json());
    const authMethods = user
      ? await this.fetchService
          .fetch('/api/auth/methods')
          .then(res => (res.ok ? res.json() : undefined))
      : undefined;
    return {
      user: user
        ? {
            ...user,
            hasPassword: Boolean(user.hasPassword),
            authMethods,
            emailVerified: user.emailVerified ? 'true' : null,
          }
        : null,
    };
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
    return await this.authProvider.signInPassword(credential);
  }

  async signInOpenAppSignInCode(code: string) {
    await this.authProvider.signInOpenAppSignInCode(code);
  }

  async signOut() {
    await this.authProvider.signOut();
    await this.nbstoreService.realtime.configure({
      endpoint: this.serverService.server.baseUrl,
      authenticated: false,
      isSelfHosted:
        this.serverService.server.config$.value.type ===
        ServerDeploymentType.Selfhosted,
    });
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
      methods: {
        password: { available: boolean };
        magicLink: { available: boolean };
        oauth: { available: boolean; providers: string[] };
        passkey: { available: boolean; discoverable: boolean };
      };
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
