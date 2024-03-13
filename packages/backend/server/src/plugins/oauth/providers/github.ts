import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { Config, URLHelper } from '../../../fundamentals';
import { AutoRegisteredOAuthProvider } from '../register';
import { OAuthProviderName } from '../types';

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
export class GithubOAuthProvider extends AutoRegisteredOAuthProvider {
  provider = OAuthProviderName.GitHub;

  constructor(
    protected readonly AFFiNEConfig: Config,
    private readonly url: URLHelper
  ) {
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

  async getToken(code: string) {
    try {
      const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          body: this.url.stringify({
            code,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.url.link('/oauth/callback'),
          }),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (response.ok) {
        const ghToken = (await response.json()) as AuthTokenResponse;

        return {
          accessToken: ghToken.access_token,
          scope: ghToken.scope,
        };
      } else {
        throw new Error(
          `Server responded with non-success code ${
            response.status
          }, ${JSON.stringify(await response.json())}`
        );
      }
    } catch (e) {
      throw new HttpException(
        `Failed to get access_token, err: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getUser(token: string) {
    try {
      const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const user = (await response.json()) as UserInfo;

        return {
          id: user.login,
          avatarUrl: user.avatar_url,
          email: user.email,
        };
      } else {
        throw new Error(
          `Server responded with non-success code ${
            response.status
          } ${await response.text()}`
        );
      }
    } catch (e) {
      throw new HttpException(
        `Failed to get user information, err: ${(e as Error).stack}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
