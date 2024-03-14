import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConnectedAccount, PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

import { AuthService, Public } from '../../core/auth';
import { UserService } from '../../core/user';
import { URLHelper } from '../../fundamentals';
import { OAuthAccount, Tokens } from './providers/def';
import { OAuthProviderFactory } from './register';
import { OAuthService } from './service';
import { OAuthProviderName } from './types';

@Controller('/oauth')
export class OAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly user: UserService,
    private readonly providerFactory: OAuthProviderFactory,
    private readonly url: URLHelper,
    private readonly db: PrismaClient
  ) {}

  @Public()
  @Get('/login')
  async login(
    @Res() res: Response,
    @Query('provider') unknownProviderName: string,
    @Query('redirect_uri') redirectUri?: string
  ) {
    // @ts-expect-error safe
    const providerName = OAuthProviderName[unknownProviderName];
    const provider = this.providerFactory.get(providerName);

    if (!provider) {
      throw new BadRequestException('Invalid provider');
    }

    const state = await this.oauth.saveOAuthState({
      redirectUri: redirectUri ?? this.url.home,
      provider: providerName,
    });

    return res.redirect(provider.getAuthUrl(state));
  }

  @Public()
  @Get('/callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') stateStr?: string
  ) {
    if (!code) {
      throw new BadRequestException('Missing query parameter `code`');
    }

    if (!stateStr) {
      throw new BadRequestException('Invalid callback state parameter');
    }

    const state = await this.oauth.getOAuthState(stateStr);

    if (!state) {
      throw new BadRequestException('OAuth state expired, please try again.');
    }

    if (!state.provider) {
      throw new BadRequestException(
        'Missing callback state parameter `provider`'
      );
    }

    const provider = this.providerFactory.get(state.provider);

    if (!provider) {
      throw new BadRequestException('Invalid provider');
    }

    const tokens = await provider.getToken(code);
    const externAccount = await provider.getUser(tokens.accessToken);
    const user = req.user;

    try {
      if (!user) {
        // if user not found, login
        const user = await this.loginFromOauth(
          state.provider,
          externAccount,
          tokens
        );
        const session = await this.auth.createUserSession(
          user,
          req.cookies[AuthService.sessionCookieName]
        );
        res.cookie(AuthService.sessionCookieName, session.sessionId, {
          expires: session.expiresAt ?? void 0, // expiredAt is `string | null`
          ...this.auth.cookieOptions,
        });
      } else {
        // if user is found, connect the account to this user
        await this.connectAccountFromOauth(
          user,
          state.provider,
          externAccount,
          tokens
        );
      }
    } catch (e: any) {
      return res.redirect(
        this.url.link('/signIn', {
          redirect_uri: state.redirectUri,
          error: e.message,
        })
      );
    }

    this.url.safeRedirect(res, state.redirectUri);
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

    let user = await this.user.findUserByEmail(externalAccount.email);

    if (user) {
      // we can't directly connect the external account with given email in sign in scenario for safety concern.
      // let user manually connect in account sessions instead.
      if (user.registered) {
        throw new BadRequestException(
          'The account with provided email is not register in the same way.'
        );
      }

      await this.user.fulfillUser(externalAccount.email, {
        emailVerifiedAt: new Date(),
        registered: true,
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
    } else {
      user = await this.createUserWithConnectedAccount(
        provider,
        externalAccount,
        tokens
      );
    }

    return user;
  }

  updateConnectedAccount(connectedUser: ConnectedAccount, tokens: Tokens) {
    return this.db.connectedAccount.update({
      where: {
        id: connectedUser.id,
      },
      data: tokens,
    });
  }

  async createUserWithConnectedAccount(
    provider: OAuthProviderName,
    externalAccount: OAuthAccount,
    tokens: Tokens
  ) {
    return this.user.createUser({
      email: externalAccount.email,
      name: externalAccount.email.split('@')[0],
      avatarUrl: externalAccount.avatarUrl,
      emailVerifiedAt: new Date(),
      connectedAccounts: {
        create: {
          provider,
          providerAccountId: externalAccount.id,
          ...tokens,
        },
      },
    });
  }

  private async connectAccountFromOauth(
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
        throw new BadRequestException(
          'The third-party account has already been connected to another user.'
        );
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
