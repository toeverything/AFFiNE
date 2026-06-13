import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  getClientVersionFromRequest,
  MissingOauthQueryParameter,
  UnknownOauthProvider,
  URLHelper,
  UseNamedGuard,
} from '../../base';
import {
  OAuthCallbackBodySchema,
  OAuthPreflightBodySchema,
  Public,
  SessionIssuer,
} from '../../core/auth';
import { OAuthProviderName } from './config';
import { OAuthProviderFactory } from './factory';
import { OAuthService } from './service';

@Controller('/api/oauth')
export class OAuthController {
  constructor(
    private readonly sessionIssuer: SessionIssuer,
    private readonly oauth: OAuthService,
    private readonly providerFactory: OAuthProviderFactory,
    private readonly url: URLHelper
  ) {}

  @Public()
  @UseNamedGuard('version')
  @Post('/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Req() req: Request, @Body() body?: unknown) {
    const input = OAuthPreflightBodySchema.safeParse(body);
    if (!input.success) {
      const fields = new Set(input.error.issues.map(issue => issue.path[0]));
      if (fields.has('client_nonce')) {
        throw new MissingOauthQueryParameter({ name: 'client_nonce' });
      }
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    const {
      provider: unknownProviderName,
      redirect_uri: redirectUri,
      client,
      client_nonce: clientNonce,
    } = input.data;

    const providerName =
      OAuthProviderName[unknownProviderName as keyof typeof OAuthProviderName];
    const provider = this.providerFactory.get(providerName);

    if (!provider) {
      throw new UnknownOauthProvider({ name: unknownProviderName });
    }

    const pkce = provider.requiresPkce ? this.oauth.createPkcePair() : null;

    if (redirectUri && !this.url.isAllowedRedirectUri(redirectUri)) {
      throw new ActionForbidden();
    }

    const clientVersion = getClientVersionFromRequest(req);
    const state = await this.oauth.saveOAuthState({
      provider: providerName,
      redirectUri,
      client,
      clientNonce,
      clientVersion,
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
    @Body() body?: unknown
  ) {
    const input = OAuthCallbackBodySchema.safeParse(body);
    if (!input.success) {
      const fields = new Set(input.error.issues.map(issue => issue.path[0]));
      if (fields.has('code')) {
        throw new MissingOauthQueryParameter({ name: 'code' });
      }
      if (fields.has('state')) {
        throw new MissingOauthQueryParameter({ name: 'state' });
      }
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    const { code, state: stateStr, client_nonce: clientNonce } = input.data;

    const verified = await this.oauth.verifyCallback({
      code,
      stateStr,
      clientNonce,
      rawBody: req.rawBody,
    });

    if (verified.type === 'handoff') {
      const clientUrl = new URL(`${verified.state.client}://authentication`);
      clientUrl.searchParams.set('method', 'oauth');
      clientUrl.searchParams.set(
        'payload',
        JSON.stringify({
          state: verified.stateToken,
          code,
          provider: verified.provider,
        })
      );
      clientUrl.searchParams.set('server', this.url.requestOrigin);

      return res.redirect(
        this.url.link('/open-app/url?', {
          url: clientUrl.toString(),
        })
      );
    }

    const { identity, state } = verified;
    const { exchangeCode } = await this.sessionIssuer.issue(req, res, identity);

    if (
      state.provider === OAuthProviderName.Apple &&
      (!state.client || state.client === 'web')
    ) {
      return this.url.safeRedirect(res, state.redirectUri ?? '/');
    }

    res.send({
      id: identity.userId,
      exchangeCode,
      redirectUri: state.redirectUri,
    });
  }
}
