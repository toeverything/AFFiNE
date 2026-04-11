import { Injectable } from '@nestjs/common';

import { InvalidOauthResponse, URLHelper } from '../../../base';
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
  email: string | null;
  avatar_url: string;
  name: string;
}

interface UserEmailInfo {
  email: string;
  primary: boolean;
  verified: boolean;
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
      scope: 'read:user user:email',
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
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const email = user.email ?? (await this.getVerifiedEmail(tokens));
    if (!email) {
      throw new InvalidOauthResponse({
        reason: 'GitHub account did not have a verified email address.',
      });
    }

    return {
      id: user.login,
      avatarUrl: user.avatar_url,
      email,
      name: user.name,
    };
  }

  private async getVerifiedEmail(tokens: Tokens) {
    const emails = await this.fetchJson<UserEmailInfo[]>(
      'https://api.github.com/user/emails',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }
    );

    return (
      emails.find(email => email.primary && email.verified)?.email ??
      emails.find(email => email.verified)?.email
    );
  }
}
