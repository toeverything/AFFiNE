import { JsonWebKey } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import {
  InternalServerError,
  InvalidOauthCallbackCode,
  URLHelper,
} from '../../../base';
import { OAuthProviderName } from '../config';
import { OAuthProvider, Tokens } from './def';

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable()
export class AppleOAuthProvider extends OAuthProvider {
  provider = OAuthProviderName.Apple;

  constructor(private readonly url: URLHelper) {
    super();
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

  async getToken(code: string) {
    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      body: this.url.stringify({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.url.link('/api/oauth/callback'),
        grant_type: 'authorization_code',
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.ok) {
      const appleToken = (await response.json()) as AuthTokenResponse;

      return {
        accessToken: appleToken.access_token,
        refreshToken: appleToken.refresh_token,
        expiresAt: new Date(Date.now() + appleToken.expires_in * 1000),
        idToken: appleToken.id_token,
      };
    } else {
      const body = await response.text();
      if (response.status < 500) {
        throw new InvalidOauthCallbackCode({ status: response.status, body });
      }
      throw new Error(
        `Server responded with non-success status ${response.status}, body: ${body}`
      );
    }
  }

  async getUser(
    tokens: Tokens & { idToken: string },
    state: { clientNonce: string }
  ) {
    const keysReq = await fetch('https://appleid.apple.com/auth/keys', {
      method: 'GET',
    });
    const { keys } = (await keysReq.json()) as { keys: JsonWebKey[] };

    const payload = await new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(
        tokens.idToken,
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
