import { JsonWebKey } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

import {
  InternalServerError,
  InvalidAuthState,
  URLHelper,
} from '../../../base';
import { OAuthProviderName } from '../config';
import type { OAuthState } from '../types';
import { OAuthProvider, Tokens } from './def';

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

const AppleProviderArgsSchema = z.object({
  privateKey: z.string().nonempty(),
  keyId: z.string().nonempty(),
  teamId: z.string().nonempty(),
});

@Injectable()
export class AppleOAuthProvider extends OAuthProvider {
  provider = OAuthProviderName.Apple;
  private args: z.infer<typeof AppleProviderArgsSchema> | null = null;
  private _jwtCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly url: URLHelper) {
    super();
  }

  override get configured() {
    if (this.config && !this.args) {
      const result = AppleProviderArgsSchema.safeParse(this.config?.args);
      if (result.success) {
        this.args = result.data;
      }
    }

    return (
      !!this.config &&
      !!this.config.clientId &&
      (!!this.config.clientSecret || !!this.args)
    );
  }

  private get clientSecret() {
    if (this.config.clientSecret) {
      return this.config.clientSecret;
    }

    if (!this.args) {
      throw new Error('Missing Apple OAuth configuration');
    }

    if (this._jwtCache && this._jwtCache.expiresAt > Date.now()) {
      return this._jwtCache.token;
    }

    const { privateKey, keyId, teamId } = this.args;
    const expiresIn = 300; // 5 minutes

    try {
      const token = jwt.sign({}, privateKey, {
        algorithm: 'ES256',
        keyid: keyId,
        expiresIn,
        issuer: teamId,
        audience: 'https://appleid.apple.com',
        subject: this.config.clientId,
      });

      this._jwtCache = {
        token,
        expiresAt: Date.now() + (expiresIn - 30) * 1000,
      };

      return token;
    } catch (e) {
      this.logger.error('Failed to generate Apple client secret JWT', e);
      throw new Error('Failed to generate client secret');
    }
  }

  getAuthUrl(state: string, clientNonce?: string): string {
    return `https://appleid.apple.com/auth/authorize?${this.url.stringify({
      client_id: this.config.clientId,
      redirect_uri: this.url.link('/api/oauth/callback'),
      scope: 'name email',
      response_type: 'code',
      response_mode: 'form_post',
      ...this.config.args,
      state,
      nonce: clientNonce,
    })}`;
  }

  async getToken(code: string, _state: OAuthState) {
    const appleToken = await this.postFormJson<AuthTokenResponse>(
      'https://appleid.apple.com/auth/token',
      this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.url.link('/api/oauth/callback'),
        grant_type: 'authorization_code',
      })
    );

    return {
      accessToken: appleToken.access_token,
      refreshToken: appleToken.refresh_token,
      expiresAt: new Date(Date.now() + appleToken.expires_in * 1000),
      idToken: appleToken.id_token,
    };
  }

  async getUser(tokens: Tokens, state: OAuthState) {
    if (!tokens.idToken) {
      throw new InvalidAuthState();
    }
    const { keys } = await this.fetchJson<{ keys: JsonWebKey[] }>(
      'https://appleid.apple.com/auth/keys',
      { method: 'GET' },
      { treatServerErrorAsInvalid: true }
    );

    const payload = await new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(
        tokens.idToken!,
        (header, callback) => {
          const key = keys.find(key => key.kid === header.kid);
          if (!key) {
            callback(
              new InternalServerError(
                'Cannot find match apple public sign key.'
              )
            );
          } else {
            callback(null, {
              format: 'jwk',
              key,
            });
          }
        },
        {
          issuer: 'https://appleid.apple.com',
          audience: this.config.clientId,
          nonce: state.clientNonce,
        },
        (err, payload) => {
          if (err || !payload || typeof payload === 'string') {
            reject(err || new InternalServerError('Invalid jwt payload'));
            return;
          }
          resolve(payload);
        }
      );
    });

    // see https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple
    if (!payload.sub || !payload.email) {
      throw new Error('Invalid jwt payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
    };
  }
}
