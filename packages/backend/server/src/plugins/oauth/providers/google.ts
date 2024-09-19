import { Injectable } from '@nestjs/common';

import { Config, URLHelper } from '../../../fundamentals';
import { OAuthProviderName } from '../config';
import { AutoRegisteredOAuthProvider } from '../register';

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
export class GoogleOAuthProvider extends AutoRegisteredOAuthProvider {
  override provider = OAuthProviderName.Google;

  constructor(
    protected readonly AFFiNEConfig: Config,
    private readonly url: URLHelper
  ) {
    super();
  }

  getAuthUrl(state: string) {
    return `https://accounts.google.com/o/oauth2/v2/auth?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/api/oauth/redirect'),
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      access_type: 'offline',
      ...this.config.args,
      state,
    })}`;
  }

  async getToken(code: string) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.url.link('/api/oauth/redirect'),
        grant_type: 'authorization_code',
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.ok) {
      const ghToken = (await response.json()) as GoogleOAuthTokenResponse;

      return {
        accessToken: ghToken.access_token,
        refreshToken: ghToken.refresh_token,
        expiresAt: new Date(Date.now() + ghToken.expires_in * 1000),
        scope: ghToken.scope,
      };
    } else {
      throw new Error(
        `Server responded with non-success code ${
          response.status
        }, ${JSON.stringify(await response.json())}`
      );
    }
  }

  async getUser(token: string) {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      const user = (await response.json()) as UserInfo;

      return {
        id: user.id,
        avatarUrl: user.picture,
        email: user.email,
      };
    } else {
      throw new Error(
        `Server responded with non-success code ${
          response.status
        } ${await response.text()}`
      );
    }
  }
}
