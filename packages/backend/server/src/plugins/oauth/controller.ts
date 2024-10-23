import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConnectedAccount, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

import { AuthService, Public } from '../../core/auth';
import { UserService } from '../../core/user';
import {
  InvalidOauthCallbackState,
  MissingOauthQueryParameter,
  OauthAccountAlreadyConnected,
  OauthStateExpired,
  UnknownOauthProvider,
} from '../../fundamentals';
import { OAuthProviderName } from './config';
import { OAuthAccount, Tokens } from './providers/def';
import { OAuthProviderFactory } from './register';
import { OAuthService } from './service';

@Controller('/api/oauth')
export class OAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly user: UserService,
    private readonly providerFactory: OAuthProviderFactory,
    private readonly db: PrismaClient
  ) {}

  @Public()
  @Post('/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(
    @Body('provider') unknownProviderName?: string,
    @Body('redirect_uri') redirectUri?: string
  ) {
    if (!unknownProviderName) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    // @ts-expect-error safe
    const providerName = OAuthProviderName[unknownProviderName];
    const provider = this.providerFactory.get(providerName);

    if (!provider) {
      throw new UnknownOauthProvider({ name: unknownProviderName });
    }

    const state = await this.oauth.saveOAuthState({
      provider: providerName,
      redirectUri,
    });

    return {
      url: provider.getAuthUrl(state),
    };
  }

  @Public()
  @Post('/callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Body('code') code?: string,
    @Body('state') stateStr?: string
  ) {
    if (!code) {
      throw new MissingOauthQueryParameter({ name: 'code' });
    }

    if (!stateStr) {
      throw new MissingOauthQueryParameter({ name: 'state' });
    }

    if (typeof stateStr !== 'string' || !this.oauth.isValidState(stateStr)) {
      throw new InvalidOauthCallbackState();
    }

    const state = await this.oauth.getOAuthState(stateStr);

    if (!state) {
      throw new OauthStateExpired();
    }

    if (!state.provider) {
      throw new MissingOauthQueryParameter({ name: 'provider' });
    }

    const provider = this.providerFactory.get(state.provider);

    if (!provider) {
      throw new UnknownOauthProvider({ name: state.provider ?? 'unknown' });
    }

    const tokens = await provider.getToken(code);
    const externAccount = await provider.getUser(tokens.accessToken);
    const user = await this.loginFromOauth(
      state.provider,
      externAccount,
      tokens
    );

    await this.auth.setCookies(req, res, user.id);
    res.send({
      id: user.id,
      redirectUri: state.redirectUri,
    });
  }

  private async loginFromOauth(
    provider: OAuthProviderName,
    externalAccount: OAuthAccount,
    tokens: Tokens
  ) {
    const connectedUser = await this.db.connectedAccount.findFirst({
      where: {
        provider,
        providerAccountId: externalAccount.id,
      },
      include: {
        user: true,
      },
    });

    if (connectedUser) {
      // already connected
      await this.updateConnectedAccount(connectedUser, tokens);

      return connectedUser.user;
    }

    const user = await this.user.fulfillUser(externalAccount.email, {
      emailVerifiedAt: new Date(),
      registered: true,
      avatarUrl: externalAccount.avatarUrl,
    });

    await this.db.connectedAccount.create({
      data: {
        userId: user.id,
        provider,
        providerAccountId: externalAccount.id,
        ...tokens,
      },
    });
    return user;
  }

  private async updateConnectedAccount(
    connectedUser: ConnectedAccount,
    tokens: Tokens
  ) {
    return this.db.connectedAccount.update({
      where: {
        id: connectedUser.id,
      },
      data: tokens,
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
    const connectedUser = await this.db.connectedAccount.findFirst({
      where: {
        provider,
        providerAccountId: externalAccount.id,
      },
    });

    if (connectedUser) {
      if (connectedUser.id !== user.id) {
        throw new OauthAccountAlreadyConnected();
      }
    } else {
      await this.db.connectedAccount.create({
        data: {
          userId: user.id,
          provider,
          providerAccountId: externalAccount.id,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    }
  }
}
