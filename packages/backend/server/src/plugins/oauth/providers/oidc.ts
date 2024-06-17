import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { Config, URLHelper } from '../../../fundamentals';
import {
  OAuthOIDCProviderConfig,
  OAuthProviderName,
  OIDCArgs,
} from '../config';
import { AutoRegisteredOAuthProvider } from '../register';
import { OAuthAccount, Tokens } from './def';

const OIDCTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
  token_type: z.string(),
});

const OIDCUserInfoSchema = z
  .object({
    sub: z.string(),
    preferred_username: z.string(),
    email: z.string().email(),
    name: z.string(),
    groups: z.array(z.string()).optional(),
  })
  .passthrough();

type OIDCUserInfo = z.infer<typeof OIDCUserInfoSchema>;

const OIDCConfigurationSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
  end_session_endpoint: z.string().url(),
});

type OIDCConfiguration = z.infer<typeof OIDCConfigurationSchema>;

const logger = new Logger('OIDCClient');

class OIDCClient {
  private static async fetch<T = any>(
    url: string,
    options: RequestInit,
    verifier: z.Schema<T>
  ): Promise<T> {
    const response = await fetch(url, options);

    if (!response.ok) {
      logger.error('Failed to fetch OIDC configuration', await response.json());
      throw new Error(`Failed to configure client`);
    }
    const data = await response.json();
    return verifier.parse(data);
  }

  static async create(config: OAuthOIDCProviderConfig, url: URLHelper) {
    const { args, clientId, clientSecret, issuer } = config;
    if (!url.verify(issuer)) {
      throw new Error('OIDC Issuer is invalid.');
    }
    const oidcConfig = await OIDCClient.fetch(
      `${issuer}/.well-known/openid-configuration`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      OIDCConfigurationSchema
    );

    return new OIDCClient(clientId, clientSecret, args, oidcConfig, url);
  }

  private constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly args: OIDCArgs | undefined,
    private readonly config: OIDCConfiguration,
    private readonly url: URLHelper
  ) {}

  authorize(state: string): string {
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
    const token = await OIDCClient.fetch(
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
      },
      OIDCTokenSchema
    );

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scope: token.scope,
    };
  }

  private mapUserInfo(
    user: OIDCUserInfo,
    claimsMap: Record<string, string>
  ): OAuthAccount {
    const mappedUser: Partial<OAuthAccount> = {};
    for (const [key, value] of Object.entries(claimsMap)) {
      const claimValue = user[value];
      if (claimValue !== undefined) {
        mappedUser[key as keyof OAuthAccount] = claimValue as string;
      }
    }
    return mappedUser as OAuthAccount;
  }

  async userinfo(token: string) {
    const user = await OIDCClient.fetch(
      this.config.userinfo_endpoint,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      OIDCUserInfoSchema
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
    const config = this.optionalConfig as OAuthOIDCProviderConfig;
    if (config && config.issuer && config.clientId && config.clientSecret) {
      this.client = await OIDCClient.create(config, this.url);
      super.onModuleInit();
    }
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
