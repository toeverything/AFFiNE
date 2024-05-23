import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { Config, URLHelper } from '../../../fundamentals';
import { AutoRegisteredOAuthProvider } from '../register';
import { OAuthOIDCProviderConfig, OAuthProviderName, OIDCArgs } from '../types';
import { OAuthAccount, Tokens } from './def';

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

class OIDCClient {
  private static async fetch<T = any>(
    url: string,
    options: RequestInit
  ): Promise<T> {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OIDC configuration: ${response.statusText}`,
        { cause: await response.json() }
      );
    }
    return response.json() as T;
  }

  static async create(config: OAuthOIDCProviderConfig, url: URLHelper) {
    const { args, clientId, clientSecret, issuer } = config;
    if (!issuer) {
      throw new Error('OIDC Issuer is not defined in the configuration.');
    }
    const oidcConfig = OIDCConfigurationSchema.parse(
      await OIDCClient.fetch(`${issuer}/.well-known/openid-configuration`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    );
    return new OIDCClient(clientId, clientSecret, args, oidcConfig, url);
  }

  private constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly args: OIDCArgs,
    private readonly config: OIDCConfiguration,
    private readonly url: URLHelper
  ) {}

  authorize(state: string) {
    const args = Object.assign({}, this.args);
    if ('claim_id' in args) delete args.claim_id;
    if ('claim_email' in args) delete args.claim_email;
    if ('claim_name' in args) delete args.claim_name;

    return `${this.config.authorization_endpoint}?${this.url.stringify({
      client_id: this.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      response_type: 'code',
      ...args,
      scope: this.args?.scope || 'openid profile email',
      state,
    })}`;
  }

  async token(code: string): Promise<Tokens> {
    const response = await OIDCClient.fetch<OIDCTokenResponse>(
      this.config.token_endpoint,
      {
        method: 'POST',
        body: this.url.stringify({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.url.link('/oauth/callback'),
          grant_type: 'authorization_code',
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
      scope: response.scope,
    };
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

  async userinfo(token: string) {
    const user = await OIDCClient.fetch<UserInfo>(
      this.config.userinfo_endpoint,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const claimsMap = {
      id: this.args?.claim_id || 'preferred_username',
      email: this.args?.claim_email || 'email',
      name: this.args?.claim_name || 'name',
    };
    const userinfo = this.mapUserInfo(user, claimsMap);
    return { id: userinfo.id, email: userinfo.email };
  }
}

@Injectable()
export class OIDCProvider
  extends AutoRegisteredOAuthProvider
  implements OnModuleInit
{
  override provider = OAuthProviderName.OIDC;
  private client: OIDCClient | null = null;

  constructor(
    protected readonly AFFiNEConfig: Config,
    private readonly url: URLHelper
  ) {
    super();
  }

  override async onModuleInit() {
    this.client = await OIDCClient.create(
      this.config as OAuthOIDCProviderConfig,
      this.url
    );
    super.onModuleInit();
  }

  private checkOIDCClient(
    client: OIDCClient | null
  ): asserts client is OIDCClient {
    if (!client) {
      throw new Error('OIDC client has not been loaded yet.');
    }
  }

  getAuthUrl(state: string): string {
    this.checkOIDCClient(this.client);
    return this.client.authorize(state);
  }

  async getToken(code: string): Promise<Tokens> {
    this.checkOIDCClient(this.client);
    return await this.client.token(code);
  }
  async getUser(token: string): Promise<OAuthAccount> {
    this.checkOIDCClient(this.client);
    return await this.client.userinfo(token);
  }
}
