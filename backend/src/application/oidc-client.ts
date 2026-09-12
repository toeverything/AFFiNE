import { createHmac } from 'node:crypto';

import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose';

import type {
  OauthProviderName,
  OidcAuthorizationInput,
  OidcClient,
  SsoProfile,
} from '../domain/sso.js';
import type { HttpFetcher } from '../domain/ports.js';

export interface OidcSettings {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  providerLabel?: OauthProviderName;
}

interface Discovered {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

export class DiscoveryOidcClient implements OidcClient {
  private discovered: Discovered | undefined;
  private jwks: RemoteJwks | undefined;
  private jwksUri: string | undefined;

  constructor(
    private readonly settings: OidcSettings,
    private readonly fetch: HttpFetcher = globalThis.fetch
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.settings.issuer &&
      this.settings.clientId &&
      this.settings.clientSecret
    );
  }

  get providerLabel(): OauthProviderName {
    return this.settings.providerLabel ?? 'OIDC';
  }

  async authorizationUrl(input: OidcAuthorizationInput): Promise<string> {
    const discovered = await this.discovery();
    const url = new URL(discovered.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.settings.clientId ?? '');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    return url.toString();
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    nonce?: string;
  }): Promise<SsoProfile> {
    const discovered = await this.discovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: this.settings.clientId ?? '',
      client_secret: this.settings.clientSecret ?? '',
    });
    const tokenRes = await this.fetch(discovered.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      throw new Error('oidc_token_failed');
    }
    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      id_token?: string;
    };

    // Per OIDC Core §3.1.3.7, the ID Token (when present) should be
    // validated: signature (via the IdP's published JWKS when available),
    // issuer/audience/expiry when the signature can be checked, and the
    // `nonce` we minted at the start of the flow whenever the token itself
    // carries one (replay / token-substitution protection). This runs even
    // when we ultimately source the profile from the userinfo endpoint,
    // since a forged/replayed id_token would otherwise go unnoticed.
    let verifiedClaims: JWTPayload | undefined;
    if (tokens.id_token) {
      verifiedClaims = await this.verifyIdToken(
        tokens.id_token,
        discovered,
        input.nonce
      );
    }

    if (discovered.userinfo_endpoint && tokens.access_token) {
      const profileRes = await this.fetch(discovered.userinfo_endpoint, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as Record<string, unknown>;
        if (
          verifiedClaims?.sub !== undefined &&
          profile.sub !== undefined &&
          String(profile.sub) !== String(verifiedClaims.sub)
        ) {
          throw new Error('oidc_subject_mismatch');
        }
        return this.toProfile(profile);
      }
    }
    if (verifiedClaims) {
      return this.toProfile(verifiedClaims);
    }
    throw new Error('oidc_profile_missing');
  }

  private async verifyIdToken(
    idToken: string,
    discovered: Discovered,
    expectedNonce: string | undefined
  ): Promise<JWTPayload> {
    let claims: JWTPayload;
    if (discovered.jwks_uri) {
      // Spec-compliant OIDC providers publish `jwks_uri` in discovery
      // (required by OpenID Connect Discovery 1.0); when present we
      // cryptographically verify the signature plus issuer/audience/expiry.
      if (!this.jwks || this.jwksUri !== discovered.jwks_uri) {
        this.jwks = createRemoteJWKSet(new URL(discovered.jwks_uri));
        this.jwksUri = discovered.jwks_uri;
      }
      const verifyOptions: { issuer?: string; audience?: string } = {};
      if (this.settings.issuer) verifyOptions.issuer = this.settings.issuer;
      if (this.settings.clientId)
        verifyOptions.audience = this.settings.clientId;
      const { payload } = await jwtVerify(idToken, this.jwks, verifyOptions);
      claims = payload;
    } else {
      // No JWKS published: we cannot cryptographically verify the
      // signature. Still reject a token that is already expired.
      claims = decodeJwt(idToken);
      if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) {
        throw new Error('oidc_id_token_expired');
      }
    }
    // Only the party that started the flow knows the nonce it minted, so if
    // the token carries one it must match ours (protects against replaying
    // a genuine id_token captured from a different login/session).
    if (
      expectedNonce &&
      claims.nonce !== undefined &&
      claims.nonce !== expectedNonce
    ) {
      throw new Error('oidc_nonce_mismatch');
    }
    return claims;
  }

  private async discovery(): Promise<Discovered> {
    if (this.discovered) {
      return this.discovered;
    }
    const issuer = this.settings.issuer?.replace(/\/$/, '');
    if (!issuer) {
      throw new Error('oidc_not_configured');
    }
    const res = await this.fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) {
      throw new Error('oidc_discovery_failed');
    }
    const json = (await res.json()) as Discovered;
    this.discovered = json;
    return json;
  }

  private toProfile(raw: Record<string, unknown>): SsoProfile {
    const email = String(raw.email ?? '');
    const sub = String(raw.sub ?? raw.id ?? email);
    const name = String(
      raw.name ?? raw.preferred_username ?? email.split('@')[0] ?? 'user'
    );
    return {
      provider: this.providerLabel,
      providerAccountId: sub,
      email,
      name,
    };
  }
}

export function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
