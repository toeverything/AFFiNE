import { errors } from '../domain/errors.js';
import type { Clock } from '../domain/ports.js';
import type { OidcClient, SsoProfile } from '../domain/sso.js';
import type { AuthService, SignInResult } from './auth-service.js';
import {
  buildAuthnRequest,
  decodeSamlResponse,
  encodeSamlRequest,
  parseSamlAssertion,
} from './saml.js';

interface PendingState {
  nonce: string;
  redirectUri: string;
  clientNonce: string | null;
  createdAt: number;
}

export interface SamlSettings {
  ssoUrl?: string;
  entityId?: string;
  certificate?: string;
}

export class SsoService {
  private readonly pending = new Map<string, PendingState>();

  constructor(
    private readonly auth: AuthService,
    private readonly oidc: OidcClient,
    private readonly saml: SamlSettings,
    private readonly publicUrl: string,
    private readonly clock: Clock
  ) {}

  oauthProviders(): string[] {
    return this.oidc.enabled ? [this.oidc.providerLabel] : [];
  }

  samlEnabled(): boolean {
    return Boolean(this.saml.ssoUrl);
  }

  async preflight(input: {
    provider: string;
    client?: string;
    redirectUri?: string;
    clientNonce?: string;
  }): Promise<{ url: string }> {
    if (!this.oidc.enabled) {
      throw errors.unknownOauth();
    }
    if (
      input.provider !== this.oidc.providerLabel &&
      input.provider !== 'OIDC'
    ) {
      throw errors.unknownOauth();
    }
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const redirectUri = input.redirectUri?.trim() || `${this.publicUrl}/`;
    this.pending.set(state, {
      nonce,
      redirectUri,
      clientNonce: input.clientNonce ?? null,
      createdAt: this.clock.now().getTime(),
    });
    const url = await this.oidc.authorizationUrl({
      state,
      nonce,
      redirectUri: `${this.publicUrl}/oauth/callback`,
    });
    return { url };
  }

  async callback(input: {
    code: string;
    state: string;
    clientNonce?: string;
    clientKind: 'web' | 'native';
  }): Promise<SignInResult & { redirectUri: string }> {
    const pending = this.takeState(input.state);
    if (
      pending.clientNonce &&
      input.clientNonce &&
      pending.clientNonce !== input.clientNonce
    ) {
      throw errors.invalidOauthState();
    }
    const profile = await this.oidc
      .exchangeCode({
        code: input.code,
        redirectUri: `${this.publicUrl}/oauth/callback`,
        nonce: pending.nonce,
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          throw error;
        }
        throw errors.invalidOauthState();
      });
    const result = await this.completeProfile(profile, input.clientKind);
    return { ...result, redirectUri: pending.redirectUri };
  }

  samlMetadata(): string {
    const entityId = this.saml.entityId ?? `${this.publicUrl}/saml`;
    const acs = `${this.publicUrl}/api/auth/saml/acs`;
    return (
      `<?xml version="1.0"?>` +
      `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">` +
      `<SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">` +
      `<AssertionConsumerService index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acs}"/>` +
      `</SPSSODescriptor></EntityDescriptor>`
    );
  }

  samlRedirectUrl(): string {
    if (!this.saml.ssoUrl) {
      throw errors.unknownOauth();
    }
    const id = `_${crypto.randomUUID()}`;
    const xml = buildAuthnRequest({
      id,
      acsUrl: `${this.publicUrl}/api/auth/saml/acs`,
      entityId: this.saml.entityId ?? `${this.publicUrl}/saml`,
      destination: this.saml.ssoUrl,
      issueInstant: this.clock.now().toISOString(),
    });
    const url = new URL(this.saml.ssoUrl);
    url.searchParams.set('SAMLRequest', encodeSamlRequest(xml));
    url.searchParams.set('RelayState', id);
    return url.toString();
  }

  async completeSaml(
    response: string,
    clientKind: 'web' | 'native'
  ): Promise<SignInResult> {
    if (!this.saml.ssoUrl) {
      throw errors.unknownOauth();
    }
    const xml = decodeSamlResponse(response);
    const profile = parseSamlAssertion(xml, this.saml.certificate);
    return this.completeProfile(profile, clientKind);
  }

  async completeProfile(
    profile: SsoProfile,
    clientKind: 'web' | 'native'
  ): Promise<SignInResult> {
    if (!profile.email.includes('@')) {
      throw errors.invalidEmail();
    }
    return this.auth.completeSso(profile, clientKind);
  }

  private takeState(state: string): PendingState {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending) {
      throw errors.invalidOauthState();
    }
    if (this.clock.now().getTime() - pending.createdAt > 10 * 60 * 1000) {
      throw errors.invalidOauthState();
    }
    return pending;
  }
}
