import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  getClientVersionFromRequest,
  MissingOauthQueryParameter,
  Throttle,
  UnknownOauthProvider,
  URLHelper,
  UseNamedGuard,
} from '../../base';
import { Public, SessionIssuer } from '../../core/auth';
import { OAuthProviderName } from './config';
import { OAuthCallbackBodySchema, OAuthPreflightBodySchema } from './input';
import { OAuthService } from './service';

@Throttle('strict')
@Controller('/api/oauth')
export class OAuthController {
  constructor(
    private readonly sessionIssuer: SessionIssuer,
    private readonly oauth: OAuthService,
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
      if (fields.has('client')) throw new ActionForbidden();
      if (fields.has('provider')) {
        const provider =
          body && typeof body === 'object' && 'provider' in body
            ? String(body.provider)
            : '';
        throw new UnknownOauthProvider({ name: provider });
      }
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }
    const {
      provider: label,
      redirect_uri: redirectUri,
      client,
      client_nonce: clientNonce,
    } = input.data;
    const provider = OAuthProviderName[label as keyof typeof OAuthProviderName];
    return await this.oauth.preflight({
      provider,
      redirectUri: redirectUri
        ? this.url.canonicalRedirectUri(redirectUri)
        : undefined,
      client,
      clientNonce,
      clientVersion: getClientVersionFromRequest(req) ?? undefined,
      callbackUrl: this.url.link(
        provider === OAuthProviderName.Apple
          ? '/api/oauth/callback'
          : '/oauth/callback'
      ),
      ...this.url.redirectPolicy(),
    });
  }

  @Public()
  @Post('/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body?: unknown
  ) {
    const input = OAuthCallbackBodySchema.safeParse(body);
    if (!input.success) {
      const fields = new Set(input.error.issues.map(issue => issue.path[0]));
      throw new MissingOauthQueryParameter({
        name: fields.has('code') ? 'code' : 'state',
      });
    }
    const result = await this.oauth.callback({
      code: input.data.code,
      state: input.data.state,
      clientNonce: input.data.client_nonce,
      issue: this.sessionIssuer.target(req),
    });
    if (result.type === 'handoff') {
      const clientUrl = new URL(`${result.client}://authentication`);
      clientUrl.searchParams.set('method', 'oauth');
      clientUrl.searchParams.set(
        'payload',
        JSON.stringify({
          state: result.stateToken,
          code: result.code,
          provider: result.provider,
        })
      );
      clientUrl.searchParams.set('server', this.url.requestOrigin);
      return res.redirect(
        this.url.link('/open-app/url?', { url: clientUrl.toString() })
      );
    }
    this.sessionIssuer.apply(res, result);
    if (
      result.provider === OAuthProviderName.Apple &&
      (!result.client || result.client === 'web')
    ) {
      return this.url.safeRedirect(res, result.redirectUri ?? '/');
    }
    res.send({
      id: result.user.id,
      exchangeCode: result.exchangeCode,
      redirectUri: result.redirectUri,
    });
  }
}
