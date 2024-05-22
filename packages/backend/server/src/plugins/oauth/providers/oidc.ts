import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { Config, URLHelper } from '../../../fundamentals';
import { AutoRegisteredOAuthProvider } from '../register';
import { OAuthOIDCProviderConfig, OAuthProviderName } from '../types';
import { OAuthAccount } from './def';

interface OIDCTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  groups?: string[];
}

const OIDCConfigurationSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
  end_session_endpoint: z.string().url(),
});

type OIDCConfiguration = z.infer<typeof OIDCConfigurationSchema>;

@Injectable()
export class OIDCProvider extends AutoRegisteredOAuthProvider {
  override provider = OAuthProviderName.OIDC;
  private oidcConfig: OIDCConfiguration | null = null;
  private readonly logger = new Logger(OIDCProvider.name);

  override get config() {
    return super.config as OAuthOIDCProviderConfig;
  }

  constructor(
    protected readonly AFFiNEConfig: Config,
    private readonly url: URLHelper
  ) {
    super();
    this.loadOIDCConfigurationAsync()
      .then(() => {
        this.logger.log('OIDC configuration loaded.');
      })
      .catch(error => {
        this.logger.error('Failed to load OIDC configuration:', error);
      });
  }

  private async loadOIDCConfigurationAsync(): Promise<void> {
    const issuer = this.config.issuer;
    if (!issuer) {
      throw new Error('OIDC Issuer is not defined in the configuration.');
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
        throw new Error(
          `Failed to fetch OIDC configuration: ${response.statusText}`
        );
      }

      const fullConfig = await response.json();
      this.oidcConfig = OIDCConfigurationSchema.parse(fullConfig);
    } catch (error) {
      throw new Error(
        `Failed to fetch OIDC configuration: ${(error as Error).message}`
      );
    }
  }

  private mapUserInfo(
    user: Record<string, any>,
    claimsMap: Record<string, string>
  ): UserInfo {
    const mappedUser: Partial<UserInfo> = {};
    for (const [key, value] of Object.entries(claimsMap)) {
      if (user[value] !== undefined) {
        mappedUser[key as keyof UserInfo] = user[value];
      }
    }
    return mappedUser as UserInfo;
  }

  private checkOIDCConfig(
    oidcConfig: OIDCConfiguration | null
  ): asserts oidcConfig is OIDCConfiguration {
    if (!oidcConfig) {
      throw new Error('OIDC configuration has not been loaded yet.');
    }
  }

  getAuthUrl(state: string): string {
    this.checkOIDCConfig(this.oidcConfig);
    const args = {
      ...this.config.args,
      scope: this.config.args?.scope || 'openid profile email',
      state,
    };
    if ('claim_id' in args) {
      delete args.claim_id;
    }
    if ('claim_email' in args) {
      delete args.claim_email;
    }
    if ('claim_name' in args) {
      delete args.claim_name;
    }
    return `${this.oidcConfig.authorization_endpoint}?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      response_type: 'code',
      ...args,
    })}`;
  }

  async getToken(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
  }> {
    this.checkOIDCConfig(this.oidcConfig);
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
          `OIDC Server responded with non-success code ${response.status}, ${JSON.stringify(errorResponse)}`
        );
      }
    } catch (e) {
      throw new HttpException(
        `OIDC Failed to get access_token, err: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
  async getUser(token: string): Promise<OAuthAccount> {
    this.checkOIDCConfig(this.oidcConfig);
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
        const userinfo = this.mapUserInfo(user, claimsMap);
        return {
          id: userinfo.id,
          email: userinfo.email,
        };
      } else {
        const errorText = await response.text();
        throw new Error(
          `OIDC Server responded with non-success code ${response.status}: ${errorText}`
        );
      }
    } catch (e) {
      const errorMessage = `OIDC Failed to get user information, err: ${(e as Error).message}`;
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
