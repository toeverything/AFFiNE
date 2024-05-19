import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Config, URLHelper } from '../../../fundamentals';
import { AutoRegisteredOAuthProvider } from '../register';
import { OAuthProviderName } from '../types';

interface OIDCTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

interface OIDCConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class OIDCProvider extends AutoRegisteredOAuthProvider {
  override provider = OAuthProviderName.OIDC;
  private oidcConfig: OIDCConfiguration | null = null;

  constructor(
    protected readonly AFFiNEConfig: Config,
    private readonly url: URLHelper,
  ) {
    super();
  }

  private mapUserInfo(user: Record<string, any>, claimsMap: Record<string, string>): UserInfo {
    const mappedUser: Partial<UserInfo> = {};
    for (const [key, value] of Object.entries(claimsMap)) {
      if (user[value] !== undefined) {
        mappedUser[key] = user[value];
      }
    }
    return mappedUser as UserInfo;
  }

  private async loadOIDCConfiguration(): Promise<void> {
    if (!this.oidcConfig) {
      const issuer = this.config.issuer;
      if (!issuer) {
        throw new Error('Issuer is not defined in the configuration.');
      }

      try {
        const wellKnownEndpoint = `${issuer}/.well-known/openid-configuration`;
        const response = await fetch(wellKnownEndpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch OIDC configuration: ${response.statusText}`);
        }

        this.oidcConfig = (await response.json()) as OIDCConfiguration;
      } catch (error) {
        throw new Error(`Failed to fetch OIDC configuration: ${(error as Error).message}`);
      }
    }
  }

  getAuthUrl(state: string): string {
    if (!this.oidcConfig) {
      throw new Error('OIDC configuration has not been loaded.');
    }
    return `${this.oidcConfig.authorization_endpoint}?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      response_type: 'code',
      scope: this.config.args.scope,
      ...this.config.args,
      state,
    })}`;
  }

  async getToken(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
  }> {
    await this.loadOIDCConfiguration();
    if (!this.oidcConfig) {
      throw new Error('OIDC configuration has not been loaded.');
    }
    try {
      const response = await fetch(this.oidcConfig.token_endpoint, {
        method: 'POST',
        body: this.url.stringify({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.url.link('/oauth/callback'),
          grant_type: 'authorization_code',
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.ok) {
        const tokenResponse = (await response.json()) as OIDCTokenResponse;

        return {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
          scope: tokenResponse.scope,
        };
      } else {
        const errorResponse = await response.json();
        throw new Error(
          `Server responded with non-success code ${response.status}, ${JSON.stringify(errorResponse)}`
        );
      }
    } catch (e) {
      throw new HttpException(
        `Failed to get access_token, err: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async getUser(token: string): Promise<UserInfo> {
    await this.loadOIDCConfiguration();
    if (!this.oidcConfig) {
      throw new Error('OIDC configuration has not been loaded.');
    }
    try {
      const response = await fetch(this.oidcConfig.userinfo_endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const user = await response.json();
        const claimsMap = {
          id: this.config.args?.claim_id || 'preferred_username',
          email: this.config.args?.claim_email || 'email',
          name: this.config.args?.claim_name || 'name',
        };
        return this.mapUserInfo(user, claimsMap);
      } else {
        const errorText = await response.text();
        throw new Error(`Server responded with non-success code ${response.status} ${errorText}`);
      }
    } catch (e) {
      throw new HttpException(
        `Failed to get user information, err: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
