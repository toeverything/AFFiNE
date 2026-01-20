import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  CalendarProviderRequestError,
  MissingOauthQueryParameter,
  OauthStateExpired,
  UnknownOauthProvider,
  URLHelper,
} from '../../base';
import { CurrentUser, Public } from '../../core/auth';
import { CalendarOAuthService } from './oauth';
import { CalendarProviderName } from './providers';
import { CalendarService } from './service';

@Controller('/api/calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly oauth: CalendarOAuthService,
    private readonly url: URLHelper
  ) {}

  @Post('/oauth/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(
    @CurrentUser() user: CurrentUser,
    @Body('provider') providerName?: CalendarProviderName,
    @Body('redirect_uri') redirectUri?: string
  ) {
    if (!providerName) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    if (!this.calendar.isProviderAvailable(providerName)) {
      throw new UnknownOauthProvider({ name: providerName });
    }

    const state = await this.oauth.saveOAuthState({
      provider: providerName,
      userId: user.id,
      redirectUri,
    });

    const callbackUrl = this.calendar.getCallbackUrl();
    const authUrl = this.calendar.getAuthUrl(providerName, state, callbackUrl);

    return { url: authUrl };
  }

  @Public()
  @Get('/oauth/callback')
  @HttpCode(HttpStatus.OK)
  async callbackGet(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') stateStr?: string
  ) {
    return this.handleCallback(res, code, stateStr);
  }

  @Public()
  @Post('/oauth/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Res() res: Response,
    @Body('code') code?: string,
    @Body('state') stateStr?: string
  ) {
    return this.handleCallback(res, code, stateStr);
  }

  @Public()
  @Post('/webhook/google')
  @HttpCode(HttpStatus.OK)
  async googleWebhook(@Req() req: Request, @Res() res: Response) {
    if (!this.calendar.getWebhookAddress('google')) {
      return res.send();
    }

    const channelId = req.header('x-goog-channel-id');
    if (!channelId) {
      return res.send();
    }

    const token = req.header('x-goog-channel-token');
    const expectedToken = this.calendar.getWebhookToken();
    if (expectedToken && token !== expectedToken) {
      return res.status(401).send();
    }

    await this.calendar.handleWebhook(CalendarProviderName.Google, channelId);
    return res.send();
  }

  private async handleCallback(
    res: Response,
    code?: string,
    stateStr?: string
  ) {
    if (!code) {
      throw new MissingOauthQueryParameter({ name: 'code' });
    }

    if (!stateStr) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    if (typeof stateStr !== 'string' || !this.oauth.isValidState(stateStr)) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    const state = await this.oauth.getOAuthState(stateStr);
    if (!state) {
      throw new OauthStateExpired();
    }

    const callbackUrl = this.calendar.getCallbackUrl();
    try {
      await this.calendar.handleOAuthCallback({
        provider: state.provider,
        code,
        redirectUri: callbackUrl,
        userId: state.userId,
      });
    } catch (error) {
      if (state.redirectUri) {
        const message = this.getCallbackErrorMessage(error);
        const redirectUrl = this.buildErrorRedirect(state.redirectUri, message);
        return this.url.safeRedirect(res, redirectUrl);
      }
      throw error;
    }

    if (state.redirectUri) {
      return this.url.safeRedirect(res, state.redirectUri);
    }

    return res.status(200).send({ ok: true });
  }

  private buildErrorRedirect(redirectUri: string, message: string) {
    const url = new URL(redirectUri, this.url.requestBaseUrl);
    url.searchParams.set('error', message);
    return url.toString();
  }

  private getCallbackErrorMessage(error: unknown) {
    if (error instanceof CalendarProviderRequestError) {
      if (error.status === 403) {
        return 'Calendar authorization failed: insufficient permissions. Please reauthorize and allow Calendar access.';
      }
      return 'Calendar authorization failed. Please try again.';
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Calendar authorization failed.';
  }
}
