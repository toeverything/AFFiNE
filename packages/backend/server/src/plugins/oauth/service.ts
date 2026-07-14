import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConnectedAccount } from '@prisma/client';

import {
  Config,
  InvalidAuthState,
  InvalidOauthCallbackState,
  MissingOauthQueryParameter,
  OauthStateExpired,
  SignUpForbidden,
  UnknownOauthProvider,
} from '../../base';
import {
  AuthChallengeStore,
  AuthService,
  type VerifiedIdentity,
} from '../../core/auth';
import { Models } from '../../models';
import { OAuthProviderName } from './config';
import { OAuthProviderFactory } from './factory';
import { OAuthStateEnvelopeSchema } from './input';
import { OAuthAccount, Tokens } from './providers/def';
import { OAuthPkceChallenge, OAuthState } from './types';

type HandoffResult = {
  type: 'handoff';
  code: string;
  provider: unknown;
  state: OAuthState;
  stateToken: string;
};

type IdentityResult = {
  type: 'identity';
  identity: VerifiedIdentity;
  state: OAuthState;
};

type VerifyCallbackResult = HandoffResult | IdentityResult;

const OAUTH_STATE_TTL_MS = 3600 * 3 * 1000;

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly providerFactory: OAuthProviderFactory,
    private readonly challenges: AuthChallengeStore,
    private readonly auth: AuthService,
    private readonly models: Models,
    private readonly config: Config
  ) {}

  isValidState(stateStr: string) {
    return stateStr.length === 36;
  }

  async saveOAuthState(state: OAuthState) {
    return this.challenges.create<OAuthState>(
      'oauth_state',
      token => ({ ...state, token }),
      OAUTH_STATE_TTL_MS
    );
  }

  async getOAuthState(token: string) {
    return this.challenges.get<OAuthState>('oauth_state', token);
  }

  availableOAuthProviders() {
    return this.providerFactory.providers;
  }

  async verifyCallback(input: {
    code: string;
    stateStr: string;
    clientNonce?: string;
    rawBody?: Buffer;
  }): Promise<VerifyCallbackResult> {
    let stateStr = input.stateStr;
    let rawState: { state: string; provider?: string } | null = null;
    if (typeof stateStr === 'string' && stateStr.length > 36) {
      try {
        const parsed = OAuthStateEnvelopeSchema.safeParse(JSON.parse(stateStr));
        if (parsed.success) {
          rawState = parsed.data;
          stateStr = rawState.state;
        }
      } catch {} // noop
    }

    if (typeof stateStr !== 'string' || !this.isValidState(stateStr)) {
      throw new InvalidOauthCallbackState();
    }

    const state = await this.getOAuthState(stateStr);
    if (!state) throw new OauthStateExpired();
    if (!state.token) state.token = stateStr;

    if (
      state.provider === OAuthProviderName.Apple &&
      rawState &&
      state.client &&
      state.client !== 'web'
    ) {
      return {
        type: 'handoff',
        code: input.code,
        provider: rawState.provider,
        state,
        stateToken: stateStr,
      };
    }

    if (!state.provider) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    const provider = this.providerFactory.get(state.provider);

    if (!provider) {
      throw new UnknownOauthProvider({ name: state.provider ?? 'unknown' });
    }

    if (
      state.provider !== OAuthProviderName.Apple &&
      (!input.clientNonce ||
        !state.clientNonce ||
        state.clientNonce !== input.clientNonce)
    ) {
      throw new InvalidAuthState();
    }

    return {
      type: 'identity',
      identity: await this.verifyCallbackIdentity(
        input.code,
        state,
        stateStr,
        input.rawBody
      ),
      state,
    };
  }

  async verifyCallbackIdentity(
    code: string,
    state: OAuthState,
    stateStr: string,
    rawBody?: Buffer
  ): Promise<VerifiedIdentity> {
    if (!state.provider) {
      throw new UnknownOauthProvider({ name: 'unknown' });
    }

    const provider = this.providerFactory.get(state.provider);

    if (!provider) {
      throw new UnknownOauthProvider({ name: state.provider });
    }

    let tokens: Tokens;
    try {
      tokens = await provider.getToken(code, state);
    } catch (err) {
      const rawBodyString = rawBody
        ? rawBody.subarray(0, 4096).toString('utf-8')
        : '';
      this.logger.warn(
        `Error getting oauth token for ${state.provider}, callback code: ${code}, stateStr: ${stateStr}, rawBody: ${rawBodyString}, error: ${err}`
      );
      throw err;
    }

    const externalAccount = await provider.getUser(tokens, state);
    const user = await this.getOrCreateUserFromOauth(
      state.provider,
      externalAccount,
      tokens
    );

    return {
      userId: user.id,
      method: 'oauth',
      clientVersion: state.clientVersion,
    };
  }

  private async getOrCreateUserFromOauth(
    provider: OAuthProviderName,
    externalAccount: OAuthAccount,
    tokens: Tokens
  ) {
    const connectedAccount = await this.models.user.getConnectedAccount(
      provider,
      externalAccount.id
    );

    if (connectedAccount) {
      await this.updateConnectedAccount(connectedAccount, tokens);

      if (
        !connectedAccount.user.emailVerifiedAt &&
        externalAccount.email.toLowerCase() ===
          connectedAccount.user.email.toLowerCase()
      ) {
        await this.auth.setEmailVerified(connectedAccount.userId);
      }
      return connectedAccount.user;
    }

    if (!this.config.auth.allowSignupForOauth) {
      throw new SignUpForbidden();
    }

    const user = await this.models.user.fulfill(externalAccount.email, {
      name: externalAccount.name,
      avatarUrl: externalAccount.avatarUrl,
    });

    await this.models.user.createConnectedAccount({
      userId: user.id,
      provider,
      providerAccountId: externalAccount.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    return user;
  }

  private async updateConnectedAccount(
    connectedAccount: ConnectedAccount,
    tokens: Tokens
  ) {
    return await this.models.user.updateConnectedAccount(connectedAccount.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  }

  createPkcePair(): OAuthPkceChallenge {
    const codeVerifier = this.randomBase64Url(96);
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64UrlEncode(hash);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  private randomBase64Url(byteLength: number) {
    return this.base64UrlEncode(randomBytes(byteLength));
  }

  private base64UrlEncode(buffer: Buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
