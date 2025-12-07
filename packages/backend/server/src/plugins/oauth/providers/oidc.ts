import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';
import { omit } from 'lodash-es';
import { z } from 'zod';

import {
  InvalidAuthState,
  InvalidOauthResponse,
  URLHelper,
} from '../../../base';
import { OAuthOIDCProviderConfig, OAuthProviderName } from '../config';
import type { OAuthState } from '../types';
import { OAuthAccount, OAuthProvider, Tokens } from './def';

const StatePayloadSchema = z.object({
  state: z.string().optional(),
  pkce: z
    .object({
      codeChallenge: z.string(),
      codeChallengeMethod: z.string(),
    })
    .optional(),
});

const OIDCTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  token_type: z.string(),
  id_token: z.string(),
});

const OIDCUserInfoSchema = z
  .object({
    sub: z.string(),
    preferred_username: z.string().optional(),
    email: z.string().email(),
    name: z.string().optional(),
    email_verified: z.boolean().optional(),
    groups: z.array(z.string()).optional(),
  })
  .passthrough();

const OIDCConfigurationSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
  issuer: z.string().url(),
  jwks_uri: z.string().url(),
});

type OIDCConfiguration = z.infer<typeof OIDCConfigurationSchema>;

@Injectable()
export class OIDCProvider extends OAuthProvider {
  override provider = OAuthProviderName.OIDC;
  #endpoints: OIDCConfiguration | null = null;
  #jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly url: URLHelper) {
    super();
  }

  override get requiresPkce() {
    return true;
  }

  private get endpoints() {
    if (!this.#endpoints) {
      throw new Error('OIDC provider is not configured');
    }
    return this.#endpoints;
  }

  private get jwks() {
    if (!this.#jwks) {
      throw new Error('OIDC provider is not configured');
    }
    return this.#jwks;
  }

  override get configured() {
    return this.#endpoints !== null && this.#jwks !== null;
  }

  protected override setup() {
    const validate = async () => {
      this.#endpoints = null;
      this.#jwks = null;

      if (super.configured) {
        const config = this.config as OAuthOIDCProviderConfig;
        if (!config.issuer) {
          this.logger.error('Missing OIDC issuer configuration');
          super.setup();
          return;
        }

        try {
          const res = await fetch(
            `${config.issuer}/.well-known/openid-configuration`,
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }
          );

          if (res.ok) {
            const configuration = OIDCConfigurationSchema.parse(
              await res.json()
            );
            if (
              this.normalizeIssuer(config.issuer) !==
              this.normalizeIssuer(configuration.issuer)
            ) {
              this.logger.error(
                `OIDC issuer mismatch, expected ${config.issuer}, got ${configuration.issuer}`
              );
            } else {
              this.#endpoints = configuration;
              this.#jwks = createRemoteJWKSet(new URL(configuration.jwks_uri));
            }
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
    const parsedState = this.parseStatePayload(state);
    const nonce = parsedState?.state ?? state;
    const pkce = parsedState?.pkce;

    if (
      this.requiresPkce &&
      (!pkce?.codeChallenge || !pkce.codeChallengeMethod)
    ) {
      throw new InvalidOauthResponse({
        reason: 'Missing PKCE challenge for OIDC authorization request',
      });
    }

    const query: JWTPayload = {
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/oauth/callback'),
      scope: this.resolveScope(this.config.args?.scope),
      response_type: 'code',
      ...omit(
        this.config.args,
        'claim_id',
        'claim_email',
        'claim_name',
        'claim_email_verified'
      ),
      state,
      nonce,
    };

    if (pkce) {
      query.code_challenge = pkce.codeChallenge;
      query.code_challenge_method = pkce.codeChallengeMethod;
    }

    return `${this.endpoints.authorization_endpoint}?${this.url.stringify(
      query
    )}`;
  }

  async getToken(code: string, state: OAuthState): Promise<Tokens> {
    if (this.requiresPkce && !state.pkce?.codeVerifier) {
      throw new InvalidAuthState();
    }

    const data = await this.postFormJson<unknown>(
      this.endpoints.token_endpoint,
      this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.url.link('/oauth/callback'),
        grant_type: 'authorization_code',
        ...(state.pkce?.codeVerifier
          ? { code_verifier: state.pkce.codeVerifier }
          : {}),
      }),
      { treatServerErrorAsInvalid: true }
    );

    const tokens = OIDCTokenSchema.parse(data);
    if (!tokens.id_token) {
      throw new InvalidOauthResponse({
        reason: 'Missing id_token in OIDC token response',
      });
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      scope: tokens.scope,
      idToken: tokens.id_token,
      tokenType: tokens.token_type,
    };
  }

  private parseStatePayload(state: string) {
    if (!state) {
      return null;
    }

    try {
      const stateObj = JSON.parse(state);
      return StatePayloadSchema.parse(stateObj);
    } catch {
      return null;
    }
  }

  private resolveScope(scope?: string) {
    if (!scope) {
      return 'openid profile email';
    }

    const segments = scope.split(/\s+/).filter(Boolean);
    if (!segments.includes('openid')) {
      segments.unshift('openid');
    }

    return segments.join(' ');
  }

  private normalizeIssuer(issuer: string) {
    return issuer.replace(/\/+$/, '');
  }

  private async verifyIdToken(idToken: string, nonce: string) {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.endpoints.issuer,
        audience: this.config.clientId,
      });

      if (!payload.nonce || payload.nonce !== nonce) {
        throw new InvalidAuthState();
      }

      return payload;
    } catch (err) {
      this.logger.warn('Failed to verify OIDC id token', err);
      throw new InvalidAuthState();
    }
  }

  private extractBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no'].includes(normalized)) {
        return false;
      }
    }

    return undefined;
  }

  private extractString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return undefined;
  }

  async getUser(tokens: Tokens, state: OAuthState): Promise<OAuthAccount> {
    if (!tokens.idToken) {
      throw new InvalidOauthResponse({
        reason: 'Missing id_token in OIDC token response',
      });
    }

    if (!state.token) {
      throw new InvalidAuthState();
    }

    const idTokenClaims = await this.verifyIdToken(tokens.idToken, state.token);

    const rawUser = await this.fetchJson<unknown>(
      this.endpoints.userinfo_endpoint,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      },
      { treatServerErrorAsInvalid: true }
    );
    const user = OIDCUserInfoSchema.parse(rawUser);

    if (!user.sub || !idTokenClaims.sub) {
      throw new InvalidOauthResponse({
        reason: 'Missing subject claim in OIDC response',
      });
    } else if (user.sub !== idTokenClaims.sub) {
      throw new InvalidOauthResponse({
        reason: 'Subject mismatch between ID token and userinfo response',
      });
    }

    const args = this.config.args ?? {};

    const claimsMap = {
      id: args.claim_id || 'sub',
      email: args.claim_email || 'email',
      name: args.claim_name || 'name',
      emailVerified: args.claim_email_verified || 'email_verified',
    };

    const accountId =
      this.extractString(user[claimsMap.id]) ?? idTokenClaims.sub;
    const email =
      this.extractString(user[claimsMap.email]) ||
      this.extractString(idTokenClaims.email);
    const emailVerified =
      this.extractBoolean(user[claimsMap.emailVerified]) ??
      this.extractBoolean(idTokenClaims.email_verified);

    if (!accountId) {
      throw new InvalidOauthResponse({
        reason: 'Missing required claim for user identifier',
      });
    }

    if (!email) {
      throw new InvalidOauthResponse({
        reason: 'Missing required claim for email',
      });
    }

    if (emailVerified === false) {
      throw new InvalidOauthResponse({
        reason: 'Email for this account is not verified',
      });
    }

    const account: OAuthAccount = {
      id: accountId,
      email,
    };

    const name =
      this.extractString(user[claimsMap.name]) ||
      this.extractString(idTokenClaims.name);
    if (name) {
      account.name = name;
    }

    return account;
  }
}
