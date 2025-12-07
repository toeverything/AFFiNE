import { Injectable } from '@nestjs/common';

import { URLHelper } from '../../../base';
import { OAuthProviderName } from '../config';
import type { OAuthState } from '../types';
import { OAuthAccount, OAuthProvider, Tokens } from './def';

interface GoogleOAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  email: string;
  picture: string;
  name: string;
}

@Injectable()
export class GoogleOAuthProvider extends OAuthProvider {
  override provider = OAuthProviderName.Google;

  constructor(private readonly url: URLHelper) {
    super();
  }

  getAuthUrl(state: string) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      access_type: 'offline',
      ...this.config.args,
      state,
    })}`;
  }

  async getToken(code: string, _state: OAuthState): Promise<Tokens> {
    const gToken = await this.postFormJson<GoogleOAuthTokenResponse>(
      'https://oauth2.googleapis.com/token',
      this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.url.link('/oauth/callback'),
        grant_type: 'authorization_code',
      })
    );

    return {
      accessToken: gToken.access_token,
      refreshToken: gToken.refresh_token,
      expiresAt: new Date(Date.now() + gToken.expires_in * 1000),
      scope: gToken.scope,
    };
  }

  async getUser(tokens: Tokens, _state: OAuthState): Promise<OAuthAccount> {
    const user = await this.fetchJson<UserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      }
    );

    return {
      id: user.id,
      avatarUrl: user.picture,
      email: user.email,
      name: user.name,
    };
  }
}
