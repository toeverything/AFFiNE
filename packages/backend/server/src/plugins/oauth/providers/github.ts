import { Injectable } from '@nestjs/common';

import { URLHelper } from '../../../base';
import { OAuthProviderName } from '../config';
import type { OAuthState } from '../types';
import { OAuthAccount, OAuthProvider, Tokens } from './def';

interface AuthTokenResponse {
  access_token: string;
  scope: string;
  token_type: string;
}

export interface UserInfo {
  login: string;
  email: string;
  avatar_url: string;
  name: string;
}

@Injectable()
export class GithubOAuthProvider extends OAuthProvider {
  provider = OAuthProviderName.GitHub;

  constructor(private readonly url: URLHelper) {
    super();
  }

  getAuthUrl(state: string) {
    return `https://github.com/login/oauth/authorize?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      scope: 'user',
      ...this.config.args,
      state,
    })}`;
  }

  async getToken(code: string, _state: OAuthState): Promise<Tokens> {
    const ghToken = await this.postFormJson<AuthTokenResponse>(
      'https://github.com/login/oauth/access_token',
      this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.url.link('/oauth/callback'),
      })
    );

    return {
      accessToken: ghToken.access_token,
      scope: ghToken.scope,
    };
  }

  async getUser(tokens: Tokens, _state: OAuthState): Promise<OAuthAccount> {
    const user = await this.fetchJson<UserInfo>('https://api.github.com/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    return {
      id: user.login,
      avatarUrl: user.avatar_url,
      email: user.email,
      name: user.name,
    };
  }
}
