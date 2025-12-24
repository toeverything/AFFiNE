import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { ConnectedAccount } from '@prisma/client';
import type { Request, Response } from 'express';

import {
  Config,
  InvalidAuthState,
  InvalidOauthCallbackState,
  MissingOauthQueryParameter,
  OauthAccountAlreadyConnected,
  OauthStateExpired,
  SignUpForbidden,
  UnknownOauthProvider,
  URLHelper,
  UseNamedGuard,
} from '../../base';
import { AuthService, Public } from '../../core/auth';
import { Models } from '../../models';
import { OAuthProviderName } from './config';
import { OAuthProviderFactory } from './factory';
import { OAuthAccount, Tokens } from './providers/def';
import { OAuthService } from './service';

@Controller('/api/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly models: Models,
    private readonly providerFactory: OAuthProviderFactory,
    private readonly url: URLHelper,
    private readonly config: Config
  ) {}

  @Public()
  @UseNamedGuard('version')
  @Post('/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(
    @Body('provider') unknownProviderName?: keyof typeof OAuthProviderName,
    @Body('redirect_uri') redirectUri?: string,
    @Body('client') client?: string,
    @Body('client_nonce') clientNonce?: string
  ) {
    if (!unknownProviderName) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    const providerName = OAuthProviderName[unknownProviderName];
    const provider = this.providerFactory.get(providerName);

    if (!provider) {
      throw new UnknownOauthProvider({ name: unknownProviderName });
    }

    const pkce = provider.requiresPkce ? this.oauth.createPkcePair() : null;

    const state = await this.oauth.saveOAuthState({
      provider: providerName,
      redirectUri,
      client,
      clientNonce,
      ...(pkce
        ? {
            pkce: {
              codeVerifier: pkce.codeVerifier,
              codeChallengeMethod: pkce.codeChallengeMethod,
            },
          }
        : {}),
    });

    const statePayload: Record<string, unknown> = {
      state,
      client,
      provider: unknownProviderName,
    };

    if (pkce) {
      statePayload.pkce = {
        codeChallenge: pkce.codeChallenge,
        codeChallengeMethod: pkce.codeChallengeMethod,
      };
    }

    const stateStr = JSON.stringify(statePayload);

    return {
      url: provider.getAuthUrl(stateStr, clientNonce),
    };
  }

  // the prerequest `/oauth/prelight` request already checked client version,
  // let's simply ignore it for callback which will block apple oauth post_form mode
  // @UseNamedGuard('version')
  @Public()
  @Post('/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Body('code') code?: string,
    @Body('state') stateStr?: string,
    @Body('client_nonce') clientNonce?: string
  ) {
    // TODO(@forehalo): refactor and remove deprecated code in 0.23
    if (!code) {
      throw new MissingOauthQueryParameter({ name: 'code' });
    }

    if (!stateStr) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    // NOTE(@forehalo): Apple sign in will directly post /callback, with `state` set at #L73
    let rawState = null;
    if (typeof stateStr === 'string' && stateStr.length > 36) {
      try {
        rawState = JSON.parse(stateStr);
        stateStr = rawState.state;
      } catch {
        /* noop */
      }
    }

    if (typeof stateStr !== 'string' || !this.oauth.isValidState(stateStr)) {
      throw new InvalidOauthCallbackState();
    }

    const state = await this.oauth.getOAuthState(stateStr);

    if (!state) {
      throw new OauthStateExpired();
    }
    if (!state.token) {
      state.token = stateStr;
    }

    if (
      state.provider === OAuthProviderName.Apple &&
      rawState &&
      state.client &&
      state.client !== 'web'
    ) {
      const clientUrl = new URL(`${state.client}://authentication`);
      clientUrl.searchParams.set('method', 'oauth');
      clientUrl.searchParams.set(
        'payload',
        JSON.stringify({
          state: stateStr,
          code,
          provider: rawState.provider,
        })
      );
      clientUrl.searchParams.set('server', this.url.requestOrigin);

      return res.redirect(
        this.url.link('/open-app/url?', {
          url: clientUrl.toString(),
        })
      );
    }

    // TODO(@fengmk2): clientNonce should be required after the client version >= 0.21.0
    if (
      state.clientNonce &&
      state.clientNonce !== clientNonce &&
      // apple sign in with nonce stored in id token
      state.provider !== OAuthProviderName.Apple
    ) {
      throw new InvalidAuthState();
    }

    if (!state.provider) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    const provider = this.providerFactory.get(state.provider);

    if (!provider) {
      throw new UnknownOauthProvider({ name: state.provider ?? 'unknown' });
    }

    let tokens: Tokens;
    try {
      tokens = await provider.getToken(code, state);
    } catch (err) {
      let rayBodyString = '';
      if (req.rawBody) {
        // only log the first 4096 bytes of the raw body
        rayBodyString = req.rawBody.subarray(0, 4096).toString('utf-8');
      }
      this.logger.warn(
        `Error getting oauth token for ${state.provider}, callback code: ${code}, stateStr: ${stateStr}, rawBody: ${rayBodyString}, error: ${err}`
      );
      throw err;
    }

    const externAccount = await provider.getUser(tokens, state);
    const user = await this.getOrCreateUserFromOauth(
      state.provider,
      externAccount,
      tokens
    );

    await this.auth.setCookies(req, res, user.id);

    if (
      state.provider === OAuthProviderName.Apple &&
      (!state.client || state.client === 'web')
    ) {
      return res.redirect(this.url.link(state.redirectUri ?? '/'));
    }

    res.send({
      id: user.id,
      redirectUri: state.redirectUri,
    });
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
      // already connected
      await this.updateConnectedAccount(connectedAccount, tokens);

      if (
        !connectedAccount.user.emailVerifiedAt &&
        // external email may change, check if it matches exists email
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

  /**
   * we currently don't support connect oauth account to existing user
   * keep it incase we need it in the future
   */
  // @ts-expect-error allow unused
  private async _connectAccount(
    user: { id: string },
    provider: OAuthProviderName,
    externalAccount: OAuthAccount,
    tokens: Tokens
  ) {
    const connectedAccount = await this.models.user.getConnectedAccount(
      provider,
      externalAccount.id
    );
    if (connectedAccount) {
      if (connectedAccount.userId !== user.id) {
        throw new OauthAccountAlreadyConnected();
      }
    } else {
      await this.models.user.createConnectedAccount({
        userId: user.id,
        provider,
        providerAccountId: externalAccount.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
    }
  }
}
