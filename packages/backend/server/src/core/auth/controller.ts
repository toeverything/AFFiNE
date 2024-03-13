import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  Config,
  PaymentRequiredException,
  URLHelper,
} from '../../fundamentals';
import { UserService } from '../user';
import { validators } from '../utils/validators';
import { CurrentUser } from './current-user';
import { Public } from './guard';
import { AuthService, parseAuthUserSeqNum } from './service';
import { TokenService, TokenType } from './token';

class SignInCredential {
  email!: string;
  password?: string;
}

@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly user: UserService,
    private readonly token: TokenService
  ) {}

  @Public()
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential,
    @Query('redirect_uri') redirectUri = this.url.home
  ) {
    validators.assertValidEmail(credential.email);
    const canSignIn = await this.auth.canSignIn(credential.email);
    if (!canSignIn) {
      throw new PaymentRequiredException(
        `You don't have early access permission\nVisit https://community.affine.pro/c/insider-general/ for more information`
      );
    }

    if (credential.password) {
      validators.assertValidPassword(credential.password);
      const user = await this.auth.signIn(
        credential.email,
        credential.password
      );

      await this.auth.setCookie(req, res, user);
      res.send(user);
    } else {
      // send email magic link
      const user = await this.user.findUserByEmail(credential.email);
      const result = await this.sendSignInEmail(
        { email: credential.email, signUp: !user },
        redirectUri
      );

      if (result.rejected.length) {
        throw new Error('Failed to send sign-in email.');
      }

      res.send({
        email: credential.email,
      });
    }
  }

  async sendSignInEmail(
    { email, signUp }: { email: string; signUp: boolean },
    redirectUri: string
  ) {
    const token = await this.token.createToken(TokenType.SignIn, email);

    const magicLink = this.url.link('/api/auth/magic-link', {
      token,
      email,
      redirect_uri: redirectUri,
    });

    const result = await this.auth.sendSignInEmail(email, magicLink, signUp);

    return result;
  }

  @Get('/sign-out')
  async signOut(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect_uri') redirectUri?: string
  ) {
    const session = await this.auth.signOut(
      req.cookies[AuthService.sessionCookieName],
      parseAuthUserSeqNum(req.headers[AuthService.authUserSeqHeaderName])
    );

    if (session) {
      res.cookie(AuthService.sessionCookieName, session.id, {
        expires: session.expiresAt ?? void 0, // expiredAt is `string | null`
        ...this.auth.cookieOptions,
      });
    } else {
      res.clearCookie(AuthService.sessionCookieName);
    }

    if (redirectUri) {
      return this.url.safeRedirect(res, redirectUri);
    } else {
      return res.send(null);
    }
  }

  @Public()
  @Get('/magic-link')
  async magicLinkSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Query('token') token?: string,
    @Query('email') email?: string,
    @Query('redirect_uri') redirectUri = this.url.home
  ) {
    if (!token || !email) {
      throw new BadRequestException('Invalid Sign-in mail Token');
    }

    email = decodeURIComponent(email);
    validators.assertValidEmail(email);

    const valid = await this.token.verifyToken(TokenType.SignIn, token, {
      credential: email,
    });

    if (!valid) {
      throw new BadRequestException('Invalid Sign-in mail Token');
    }

    const user = await this.user.fulfillUser(email, {
      emailVerifiedAt: new Date(),
      registered: true,
    });

    await this.auth.setCookie(req, res, user);

    return this.url.safeRedirect(res, redirectUri);
  }

  @Get('/authorize')
  async authorize(
    @CurrentUser() user: CurrentUser,
    @Query('redirect_uri') redirect_uri?: string
  ) {
    const session = await this.auth.createUserSession(
      user,
      undefined,
      this.config.auth.accessToken.ttl
    );

    this.url.link(redirect_uri ?? '/open-app/redirect', {
      token: session.sessionId,
    });
  }

  @Public()
  @Get('/session')
  async currentSessionUser(@CurrentUser() user?: CurrentUser) {
    return {
      user,
    };
  }

  @Public()
  @Get('/sessions')
  async currentSessionUsers(@Req() req: Request) {
    const token = req.cookies[AuthService.sessionCookieName];
    if (!token) {
      return {
        users: [],
      };
    }

    return {
      users: await this.auth.getUserList(token),
    };
  }

  @Public()
  @Get('/challenge')
  async challenge() {
    // TODO: impl in following PR
    return {
      challenge: randomUUID(),
      resource: randomUUID(),
    };
  }
}
