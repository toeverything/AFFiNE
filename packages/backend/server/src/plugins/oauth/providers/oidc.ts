import { Injectable } from '@nestjs/common';
import { omit } from 'lodash-es';
import { z } from 'zod';

import {
  InvalidOauthCallbackCode,
  InvalidOauthResponse,
  URLHelper,
} from '../../../base';
import { OAuthOIDCProviderConfig, OAuthProviderName } from '../config';
import { OAuthAccount, OAuthProvider, Tokens } from './def';

const OIDCTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string().optional(),
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

const OIDCConfigurationSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
});

type OIDCConfiguration = z.infer<typeof OIDCConfigurationSchema>;

@Injectable()
export class OIDCProvider extends OAuthProvider {
  override provider = OAuthProviderName.OIDC;
  #endpoints: OIDCConfiguration | null = null;

  constructor(private readonly url: URLHelper) {
    super();
  }

  private get endpoints() {
    if (!this.#endpoints) {
      throw new Error('OIDC provider is not configured');
    }
    return this.#endpoints;
  }

  override get configured() {
    return this.#endpoints !== null;
  }

  protected override setup() {
    const validate = async () => {
      this.#endpoints = null;

      if (super.configured) {
        const config = this.config as OAuthOIDCProviderConfig;
        try {
          const res = await fetch(
            `${config.issuer}/.well-known/openid-configuration`,
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }
          );

          if (res.ok) {
            this.#endpoints = OIDCConfigurationSchema.parse(await res.json());
          } else {
            this.logger.error(`Invalid OIDC issuer ${config.issuer}`);
          }
        } catch (e) {
          this.logger.error('Failed to validate OIDC configuration', e);
        }
      }

      super.setup();
    };

    validate().catch(() => {
      /* noop */
    });
  }

  getAuthUrl(state: string): string {
    return `${this.endpoints.authorization_endpoint}?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      scope: this.config.args?.scope || 'openid profile email',
      response_type: 'code',
      ...omit(this.config.args, 'claim_id', 'claim_email', 'claim_name'),
      state,
    })}`;
  }

  async getToken(code: string): Promise<Tokens> {
    const res = await fetch(this.endpoints.token_endpoint, {
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

    if (res.ok) {
      const data = await res.json();
      const tokens = OIDCTokenSchema.parse(data);
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
      };
    }

    throw new InvalidOauthCallbackCode({
      status: res.status,
      body: await res.text(),
    });
  }

  async getUser(tokens: Tokens): Promise<OAuthAccount> {
    const res = await fetch(this.endpoints.userinfo_endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (res.ok) {
      const body = await res.json();
      const user = OIDCUserInfoSchema.parse(body);

      const args = this.config.args ?? {};

      const claimsMap = {
        id: args.claim_id || 'preferred_username',
        email: args.claim_email || 'email',
        name: args.claim_name || 'name',
      };

      const identities = {
        id: user[claimsMap.id] as string,
        email: user[claimsMap.email] as string,
      };

      if (!identities.id || !identities.email) {
        throw new InvalidOauthResponse({
          reason: `Missing required claims: ${Object.keys(identities)
            .filter(key => !identities[key as keyof typeof identities])
            .join(', ')}`,
        });
      }

      return identities;
    }

    throw new InvalidOauthCallbackCode({
      status: res.status,
      body: await res.text(),
    });
  }
}
