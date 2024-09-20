import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  Config,
  EarlyAccessRequired,
  EmailTokenNotFound,
  InternalServerError,
  InvalidEmail,
  InvalidEmailToken,
  SignUpForbidden,
  Throttle,
  URLHelper,
  UseNamedGuard,
} from '../../fundamentals';
import { UserService } from '../user';
import { validators } from '../utils/validators';
import { Public } from './guard';
import { AuthService } from './service';
import { CurrentUser, Session } from './session';
import { TokenService, TokenType } from './token';

interface PreflightResponse {
  registered: boolean;
  hasPassword: boolean;
}

interface SignInCredential {
  email: string;
  password?: string;
  callbackUrl?: string;
}

interface MagicLinkCredential {
  email: string;
  token: string;
}

@Throttle('strict')
@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly user: UserService,
    private readonly token: TokenService,
    private readonly config: Config
  ) {}

  @Public()
  @Post('/preflight')
  async preflight(
    @Body() params?: { email: string }
  ): Promise<PreflightResponse> {
    if (!params?.email) {
      throw new InvalidEmail();
    }
    validators.assertValidEmail(params.email);

    const user = await this.user.findUserWithHashedPasswordByEmail(
      params.email
    );

    if (!user) {
      return {
        registered: false,
        hasPassword: false,
      };
    }

    return {
      registered: user.registered,
      hasPassword: !!user.password,
    };
  }

  @Public()
  @UseNamedGuard('captcha')
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential,
    /**
     * @deprecated
     */
    @Query('redirect_uri') redirectUri?: string
  ) {
    validators.assertValidEmail(credential.email);
    const canSignIn = await this.auth.canSignIn(credential.email);
    if (!canSignIn) {
      throw new EarlyAccessRequired();
    }

    if (credential.password) {
      await this.passwordSignIn(
        req,
        res,
        credential.email,
        credential.password
      );
    } else {
      await this.sendMagicLink(
        req,
        res,
        credential.email,
        credential.callbackUrl,
        redirectUri
      );
    }
  }

  async passwordSignIn(
    req: Request,
    res: Response,
    email: string,
    password: string
  ) {
    const user = await this.auth.signIn(email, password);

    await this.auth.setCookies(req, res, user.id);
    res.status(HttpStatus.OK).send(user);
  }

  async sendMagicLink(
    _req: Request,
    res: Response,
    email: string,
    callbackUrl = '/magic-link',
    redirectUrl?: string
  ) {
    // send email magic link
    const user = await this.user.findUserByEmail(email);
    if (!user) {
      const allowSignup = await this.config.runtime.fetch('auth/allowSignup');
      if (!allowSignup) {
        throw new SignUpForbidden();
      }
    }

    const token = await this.token.createToken(TokenType.SignIn, email);

    const magicLink = this.url.link(callbackUrl, {
      token,
      email,
      ...(redirectUrl
        ? {
            redirect_uri: redirectUrl,
          }
        : {}),
    });

    const result = await this.auth.sendSignInEmail(email, magicLink, !user);

    if (result.rejected.length) {
      throw new InternalServerError('Failed to send sign-in email.');
    }

    res.status(HttpStatus.OK).send({
      email: email,
    });
  }

  @Public()
  @Get('/sign-out')
  async signOut(
    @Res() res: Response,
    @Session() session: Session | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    if (!session) {
      return;
    }

    await this.auth.signOut(session.sessionId, userId);
    await this.auth.refreshCookies(res, session.sessionId);

    res.status(HttpStatus.OK).send({});
  }

  @Public()
  @Post('/magic-link')
  async magicLinkSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() { email, token }: MagicLinkCredential
  ) {
    if (!token || !email) {
      throw new EmailTokenNotFound();
    }

    validators.assertValidEmail(email);

    const tokenRecord = await this.token.verifyToken(TokenType.SignIn, token, {
      credential: email,
    });

    if (!tokenRecord) {
      throw new InvalidEmailToken();
    }

    const user = await this.user.fulfillUser(email, {
      emailVerifiedAt: new Date(),
      registered: true,
    });

    await this.auth.setCookies(req, res, user.id);
    res.send({ id: user.id });
  }

  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/session')
  async currentSessionUser(@CurrentUser() user?: CurrentUser) {
    return {
      user,
    };
  }

  @Throttle('default', { limit: 1200 })
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
}
